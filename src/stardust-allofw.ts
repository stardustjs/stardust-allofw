export let version = "0.0.1";

// export { AllofwPlatform3D } from "./allofw/allofw";
export { AllofwPlatform3D as AllofwPlatform3D } from "./allofw/allofwGS";

import { registerPlatformConstructor } from "stardust-core";
// import { AllofwPlatform3D } from "./allofw/allofw";
import { AllofwPlatform3D as AllofwPlatform3D } from "./allofw/allofwGS";

registerPlatformConstructor("allofw-3d", (w: any, omni: any) => {
    return new AllofwPlatform3D(w, omni);
});

registerPlatformConstructor("allofw-3d-gs", (w: any, omni: any) => {
    return new AllofwPlatform3D(w, omni);
});