export let version = "0.0.1";

export { AllofwPlatform3D as AllofwPlatform3D } from "./allofw/allofw";

import { registerPlatformConstructor } from "stardust-core";
import { AllofwPlatform3D as AllofwPlatform3D } from "./allofw/allofw";

registerPlatformConstructor("allofw-3d", (w: any, omni: any) => {
    return new AllofwPlatform3D(w, omni);
});