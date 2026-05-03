import { DEFAULT_PARAMS } from "./src/constants";
import { getParamsFromUrl } from "./src/utils/url";

// Mock window location
(global as any).window = {
  location: {
    search: "?demoMode=true&salary=100000", // Even if there is salary, demoMode triggers average american overrides! Wait no, average american doesn't override url args in string params!
    // Actually, getParamsFromUrl gives us { params: { salary: 100000, ...defaults }, isDemoMode: true }
    // useSimulationStore then does { ...params, ...AVERAGE_AMERICAN_PARAMS }, which OVERWRITES salary to 70000!
  },
};

const parsed = getParamsFromUrl();
console.log("isDemoMode:", parsed.isDemoMode);
console.log("Salary parsed from URL directly:", parsed.params.salary);

import { useSimulationStore } from "./src/store/useSimulationStore";
const store = useSimulationStore.getState();
console.log("Store isDemoMode:", store.isDemoMode);
console.log("Store salary (should be demo param 70k):", store.params.salary);
console.log(
  "Store saved salary (should be 100k!):",
  store.savedUserParams?.salary,
);
