import { ok } from "./src/core/result.js";
import { runSaga } from "./src/core/saga.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const step1 = {
  name: "Step 1",
  execute: async () => {
    console.log("executing 1");
    await sleep(2000);
    return ok(undefined);
  },
  compensate: async () => {
    console.log("compensating 1");
    await sleep(500);
    return ok(undefined);
  },
};

const step2 = {
  name: "Step 2",
  execute: async () => {
    console.log("executing 2");
    await sleep(4000);
    return ok(undefined);
  },
  compensate: async () => {
    console.log("compensating 2");
    await sleep(500);
    return ok(undefined);
  },
};

runSaga([step1, step2], (name, status) => {
  console.log(name, status);
}).then(() => console.log("Done"));
