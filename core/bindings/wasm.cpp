// Emscripten embind bindings — same Chamber API for the browser client.
// Build: emcmake cmake .. -DEMSCRIPTEN=ON && emmake make ffengine_wasm
#ifdef __EMSCRIPTEN__
#include <emscripten/bind.h>

#include "chamber.hpp"
#include "material_risk.hpp"

using namespace emscripten;
using namespace ff;

EMSCRIPTEN_BINDINGS(freefall_engine) {
    class_<MaterialRisk>("MaterialRisk")
        .constructor<>()
        .function("loadJson", &MaterialRisk::loadJson)
        .function("all", &MaterialRisk::all)
        .function("ignitionPressure", [](const MaterialRisk& self,
                                         const std::string& id, double o2) {
            const Material* m = self.get(id);
            return m ? MaterialRisk::ignitionPressure(*m, o2) : -1.0;
        });

    value_object<Chamber::Config>("ChamberConfig")
        .field("investigationId", &Chamber::Config::investigationId)
        .field("materialId", &Chamber::Config::materialId)
        .field("model", &Chamber::Config::model)
        .field("o2Pct", &Chamber::Config::o2Pct)
        .field("flowCms", &Chamber::Config::flowCms)
        .field("pressureKpa", &Chamber::Config::pressureKpa)
        .field("slabLengthCm", &Chamber::Config::slabLengthCm)
        .field("dropletD0Mm", &Chamber::Config::dropletD0Mm)
        .field("partialGravity", &Chamber::Config::partialGravity)
        .field("seed", &Chamber::Config::seed);

    class_<Chamber>("Chamber")
        .constructor<>()
        .constructor<MaterialRisk>()
        .function("configure", &Chamber::configure)
        .function("step", &Chamber::step)
        .function("ignitionPressure", &Chamber::ignitionPressure)
        .function("regime", &Chamber::regime)
        .function("hotBurning", &Chamber::hotBurning)
        .function("coolFlame", &Chamber::coolFlame)
        .function("finished", &Chamber::finished)
        .function("stateJson", &Chamber::stateJson)
        .function("drainEvents", &Chamber::drainEvents);
}
#endif
