/**
 * @file snapshot.hpp
 * @brief Lightweight helpers for creating V8 heap‑snapshots
 *
 *  This header isolates all snapshot‑related code, allowing it to be reused
 *  from multiple translation units without duplicating logic or V8 includes.
 *
 *  • `HeapSnapshotWriter::write(const std::string& path)`  
 *      Takes a full heap‑snapshot via `v8::HeapProfiler` and serialises it in
 *      Chrome‑DevTools JSON format to the specified file. Returns `true` on
 *      success.  
 *
 *  The implementation is header‑only to avoid linker hassles in Node‑addon
 *  scenarios and because the codebase is small. All I/O errors are signalled
 *  by `false`; higher layers decide whether to retry or alert.
 *
 *  Usage
 *  -----
 *      #include "snapshot.hpp"
 *      bool ok = HeapSnapshotWriter::write("heap-123.heapsnapshot");
 */

 #pragma once

 #include <v8.h>
 
 #include <fstream>
 #include <string>
 
 namespace memwatchdog {
 
 /* ------------------------------------------------------------------------- */
 /*  File‑output adapter compatible with v8::OutputStream                     */
 /* ------------------------------------------------------------------------- */
 class FileOutputStream final : public v8::OutputStream {
   public:
     explicit FileOutputStream(const std::string& path)
         : file_(path, std::ios::out | std::ios::binary) {}
 
     FileOutputStream(const FileOutputStream&)            = delete;
     FileOutputStream& operator=(const FileOutputStream&) = delete;
 
     WriteResult WriteAsciiChunk(char* data, int size) override {
         file_.write(data, size);
         return file_.good() ? kContinue : kAbort;
     }
 
     void EndOfStream() override { file_.close(); }
 
     [[nodiscard]] bool isValid() const noexcept { return file_.is_open(); }
 
   private:
     std::ofstream file_;
 };
 
 /* ------------------------------------------------------------------------- */
 /*  Public façade                                                            */
 /* ------------------------------------------------------------------------- */
 struct HeapSnapshotWriter {
     /**
      * @brief Serialise current heap‑snapshot to `path`.
      * @return `true` if file was written successfully.
      */
     static bool write(const std::string& path) {
         v8::Isolate* isolate = v8::Isolate::GetCurrent();
         if (!isolate) return false;
 
         const v8::HeapSnapshot* snapshot =
             isolate->GetHeapProfiler()->TakeHeapSnapshot();
 
         FileOutputStream stream(path);
         if (!stream.isValid()) return false;
 
         snapshot->Serialize(&stream, v8::HeapSnapshot::kJSON);
         return true;
     }
 };
 
 }  // namespace memwatchdog
 