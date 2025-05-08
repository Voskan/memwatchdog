{
  "variables": { "napi_build_version%": "8" },

  "targets": [
    {
      "target_name": "memwatchdog_native",
      "sources": [ "addon.cc" ],

      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],

      "cflags_cc": [ "-O3", "-fno-exceptions" ],
      "defines":   [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],

      "conditions": [

        [ "OS!='win'", {
          "xcode_settings": {
            "OTHER_CPLUSPLUSFLAGS": [ "-std=gnu++20" ]
          },
          "cflags_cc+": [ "-std=gnu++20" ]
        }],

        [ "OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": "0",
              "AdditionalOptions": [
                "/std:c++20",
                "/O2"
              ]
            }
          }
        }]
      ]
    }
  ]
}
