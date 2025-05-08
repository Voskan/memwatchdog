// native/addon.cc  –  MemWatchdog N‑API addon compatible with Node 18‑22
// Build: node-gyp (binding.gyp). Requires C++17, no exceptions.

#include <napi.h>          // C++ wrapper over node_api.h
#include <uv.h>
#include <v8.h>
#include <v8-profiler.h>
#include <atomic>
#include <chrono>
#include <deque>
#include <fstream>
#include <string>
#include <thread>

namespace mw {
using Clock = std::chrono::steady_clock;
using ms    = std::chrono::milliseconds;

//--------------------------------------------------------------------
// Utility: dump V8 heap‑snapshot to a file in DevTools JSON format
//--------------------------------------------------------------------
class FileStream : public v8::OutputStream {
 public:
  explicit FileStream(std::ofstream &f) : file_(f) {}

  v8::OutputStream::WriteResult WriteAsciiChunk(char* data,int size) override {
    file_.write(data, size);
    return v8::OutputStream::kContinue;
  }
  void EndOfStream() override { file_.flush(); }

 private:
  std::ofstream &file_;
};

static bool DumpSnapshot(v8::Isolate *iso, const std::string &path) {
  std::ofstream out(path, std::ios::binary);
  if (!out.is_open()) return false;

  FileStream stream(out);
#if V8_MAJOR_VERSION >= 11
  auto format = v8::HeapSnapshot::SerializationFormat::kJSON;
  iso->GetHeapProfiler()->TakeHeapSnapshot()->Serialize(&stream, format);
#else
  iso->GetHeapProfiler()->TakeHeapSnapshot()->Serialize(&stream, v8::HeapSnapshot::kJSON);
#endif
  return true;
}

//--------------------------------------------------------------------
// Watchdog implementation – runs on a dedicated std::thread
//--------------------------------------------------------------------
class Watchdog {
 public:
  struct Options {
    uint32_t interval   = 60'000;     // ms
    uint32_t window     = 30;         // samples kept
    double   threshold  = 1024.0;     // bytes / ms
    Napi::ThreadSafeFunction tsfn;    // callback into JS
  };

  explicit Watchdog(Options opts, Napi::Env env)
      : opts_(std::move(opts)), env_(env) {
    running_.store(true);
    thread_ = std::thread(&Watchdog::loop, this);
  }

  ~Watchdog() {
    running_.store(false);
    if (thread_.joinable()) thread_.join();
    opts_.tsfn.Abort();
  }

 private:
  struct Pt { Clock::time_point t; size_t bytes; };
  std::deque<Pt> buf_;
  std::atomic<bool> running_{false};
  Options opts_;
  std::thread thread_;
  Napi::Env env_;

  static double slope(const std::deque<Pt> &buf) {
    if (buf.size() < 3) return 0.0;
    double n    = buf.size();
    double sx=0, sy=0, sxy=0, sx2=0;
    for (auto &p : buf) {
      double x = std::chrono::duration<double, std::milli>(p.t.time_since_epoch()).count();
      double y = static_cast<double>(p.bytes);
      sx += x; sy += y; sxy += x*y; sx2 += x*x;
    }
    double denom = n*sx2 - sx*sx;
    if (denom == 0) return 0.0;
    return (n*sxy - sx*sy) / denom;
  }

  void loop() {
    auto *iso = v8::Isolate::GetCurrent();
    while (running_.load()) {
      std::this_thread::sleep_for(ms(opts_.interval));

      v8::HeapStatistics hs; iso->GetHeapStatistics(&hs);
      size_t used = hs.used_heap_size();
      buf_.push_back({Clock::now(), used});
      if (buf_.size() > opts_.window) buf_.pop_front();

      double sl = slope(buf_);
      if (sl >= opts_.threshold) {
        std::string file = "heap-" + std::to_string(std::time(nullptr)) + ".heapsnapshot";
        if (DumpSnapshot(iso, file)) {
          opts_.tsfn.BlockingCall([sl,file=std::move(file)](Napi::Env env, Napi::Function jsCb){
            jsCb.Call({ Napi::Number::New(env, sl), Napi::String::New(env, file) });
          });
        }
      }
    }
  }
};

//--------------------------------------------------------------------
// N‑API glue
//--------------------------------------------------------------------

static Napi::Value Start(const Napi::CallbackInfo &info) {
  auto env  = info.Env();
  auto opts = info.Length()
                ? info[0].As<Napi::Object>()
                : Napi::Object::New(env);

  uint32_t interval   = opts.Get("interval").ToNumber().Uint32Value();
  uint32_t window     = opts.Get("window").ToNumber().Uint32Value();
  double   threshold  = opts.Get("threshold").ToNumber().DoubleValue();

  auto cb = opts.Get("cb").As<Napi::Function>();
  auto tsfn = Napi::ThreadSafeFunction::New(env, cb, "mw_alert", 0, 1);

  Watchdog::Options o{interval ? interval : 60'000,
                      window   ? window   : 30,
                      threshold? threshold: 1024.0,
                      std::move(tsfn)};
  auto *wd = new Watchdog(std::move(o), env);
  return Napi::External<Watchdog>::New(env, wd, [](Napi::Env, Watchdog *p){ delete p; });
}

static Napi::Value Stop(const Napi::CallbackInfo &info) {
  if (info.Length() && info[0].IsExternal()) {
    delete info[0].As<Napi::External<Watchdog>>().Data();
  }
  return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("start", Napi::Function::New(env, Start));
  exports.Set("stop" , Napi::Function::New(env, Stop ));
  return exports;
}

NODE_API_MODULE(memwatchdog_native, Init)
} // namespace mw
