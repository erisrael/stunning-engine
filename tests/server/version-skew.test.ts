// A page left open across a deploy (calls, Seed Town) gets errors from the old build; they are recognised so the page
// loads the new build instead of showing "This page could not load".
import { isStaleBuild } from "../../src/components/app/version-watch";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
};

class UnrecognizedActionError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "UnrecognizedActionError";
  }
}
check("the browser's missing Server Action", isStaleBuild(new UnrecognizedActionError('Server Action "4056bc" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action')));
check("the server's wording", isStaleBuild(new Error('Failed to find Server Action "40ad06". This request might be from an older or newer deployment.')));
check("a code file of the old build", isStaleBuild(Object.assign(new Error("Loading chunk 8123 failed."), { name: "ChunkLoadError" })));
check("a module that is gone", isStaleBuild(new TypeError("error loading dynamically imported module: /_next/static/chunks/x.js")));
check("an ordinary error is not", !isStaleBuild(new Error("Cannot read properties of undefined (reading 'id')")));
check("nothing is not", !isStaleBuild(null));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
