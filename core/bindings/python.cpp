#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include "chamber.hpp"
#include "material_risk.hpp"

namespace py = pybind11;
using namespace ff;

PYBIND11_MODULE(freefall_engine, m) {
    m.doc() = "Freefall Foundry — reduced-order microgravity combustion engine "
              "(d²-law droplets, SAFFIRE-type spread, ACME material risk)";

    py::class_<Material>(m, "Material")
        .def_readonly("id", &Material::id)
        .def_readonly("name", &Material::name)
        .def_readonly("locPct", &Material::locPct)
        .def_readonly("spreadMinCms", &Material::spreadMinCms)
        .def_readonly("spreadMaxCms", &Material::spreadMaxCms)
        .def_readonly("sootIndex", &Material::sootIndex)
        .def_readonly("coolFlameCapable", &Material::coolFlameCapable)
        .def_readonly("smoldering", &Material::smoldering)
        .def_readonly("burnRateK0Mm2s", &Material::burnRateK0Mm2s)
        .def_readonly("burnRateKO2Mm2sPct", &Material::burnRateKO2Mm2sPct)
        .def_readonly("extinctionDHotMm", &Material::extinctionDHotMm)
        .def_readonly("extinctionDMinMm", &Material::extinctionDMinMm)
        .def_readonly("ignitionLogitA", &Material::ignitionLogitA)
        .def_readonly("ignitionLogitB", &Material::ignitionLogitB)
        .def_readonly("ignitionFitN", &Material::ignitionFitN);

    py::class_<RiskBreakdown>(m, "RiskBreakdown")
        .def_readonly("ignitionPressure", &RiskBreakdown::ignitionPressure)
        .def_readonly("flowFactor", &RiskBreakdown::flowFactor)
        .def_readonly("hiddenFactor", &RiskBreakdown::hiddenFactor)
        .def_readonly("gravityFactor", &RiskBreakdown::gravityFactor)
        .def_readonly("riskIndex", &RiskBreakdown::riskIndex);

    py::class_<MaterialRisk>(m, "MaterialRisk")
        .def(py::init<>())
        .def("load_json", &MaterialRisk::loadJson)
        .def("all", &MaterialRisk::all)
        .def("ignition_pressure", [](const MaterialRisk& self,
                                     const std::string& id, double o2) {
            const Material* m = self.get(id);
            return m ? MaterialRisk::ignitionPressure(*m, o2) : -1.0;
        })
        .def("risk_index", [](const MaterialRisk& self,
                              const std::string& id, double o2,
                              double flow, const std::string& gravity) {
            const Material* m = self.get(id);
            return m ? MaterialRisk::riskIndex(*m, o2, flow, gravity) : -1.0;
        })
        .def("risk_breakdown", [](const MaterialRisk& self,
                                  const std::string& id, double o2,
                                  double flow, const std::string& gravity) {
            const Material* m = self.get(id);
            return m ? MaterialRisk::riskBreakdown(*m, o2, flow, gravity)
                     : RiskBreakdown{};
        })
        .def("coflow_outcome", [](const MaterialRisk& self,
                                  const std::string& fuel, double o2Pct,
                                  double o2EndPct, double mfLo, double mfHi,
                                  double burnTimeS) {
            return static_cast<int>(self.coflowOutcome(
                fuel, o2Pct, o2EndPct, mfLo, mfHi, burnTimeS));
        });

    py::class_<Chamber::Config>(m, "ChamberConfig")
        .def(py::init<>())
        .def_readwrite("investigationId", &Chamber::Config::investigationId)
        .def_readwrite("materialId", &Chamber::Config::materialId)
        .def_readwrite("model", &Chamber::Config::model)
        .def_readwrite("o2Pct", &Chamber::Config::o2Pct)
        .def_readwrite("flowCms", &Chamber::Config::flowCms)
        .def_readwrite("pressureKpa", &Chamber::Config::pressureKpa)
        .def_readwrite("slabLengthCm", &Chamber::Config::slabLengthCm)
        .def_readwrite("dropletD0Mm", &Chamber::Config::dropletD0Mm)
        .def_readwrite("partialGravity", &Chamber::Config::partialGravity)
        .def_readwrite("seed", &Chamber::Config::seed)
        .def_readwrite("volumeLiters", &Chamber::Config::volumeLiters)
        .def_readwrite("ambientO2Pct", &Chamber::Config::ambientO2Pct)
        .def_readwrite("ventPerSec", &Chamber::Config::ventPerSec)
        .def_readwrite("co2Pct", &Chamber::Config::co2Pct)
        .def_readwrite("hePct", &Chamber::Config::hePct);

    py::class_<Chamber>(m, "Chamber")
        .def(py::init<>())
        .def(py::init<MaterialRisk>())
        .def("configure", &Chamber::configure)
        .def("step", &Chamber::step)
        .def("update_atmosphere", &Chamber::updateAtmosphere)
        .def("set_suppressants", &Chamber::setSuppressants)
        .def("chamber_o2_pct", &Chamber::chamberO2Pct)
        .def("effective_o2_pct", &Chamber::effectiveO2Pct)
        .def("ignition_pressure", &Chamber::ignitionPressure)
        .def("regime", &Chamber::regime)
        .def("hot_burning", &Chamber::hotBurning)
        .def("cool_flame", &Chamber::coolFlame)
        .def("finished", &Chamber::finished)
        .def("state_json", &Chamber::stateJson)
        .def("drain_events", &Chamber::drainEvents);
}
