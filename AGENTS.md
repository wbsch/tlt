### Basic instructions

The version of this app is already running at http://localhost:5173/ - the user already manually started "npm run dev". For debugging the app in the browser, use the Chrome MCP extension. Be somewhat careful with requesting too much info from there, because it fills up your context window FAST. Go for explicit JS execution with short results, or direct interaction with mouse and keyboard, or whatever else is short and direct - you already know the HTML DOM layout from the source code. Asking for full page snapshots should be a last resort.

Try to find problems, fix them, then make sure they are actually fixed in the browser by reloading and trying to reproduce the problems again. Keep trying unless they are definitely fixed.

The root "OoTMM" folder is the OoTMM randomizer. NEVER change code in there. Treat it like an external library. It is its own external git repository.

### Common operations

If you changed code that pertains to the core map tracker logic or its usage of the OoTMM randomizer's logic, test reachability of checks: `node --import tsx test_reachability.ts`
(`npx tsx`/`npm exec tsx`/`./node_modules/.bin/tsx` can fail in sandboxed environments with `EPERM` on tsx IPC pipes.)

Feel free to temporarily edit `test_reachability.ts` in order to test other things, or use it as a blueprint for a similar file.

If you have changed relevant files, make sure the build still runs successfully before you're done: Run `npm run build`

Before returning control to the user, also make sure that when clicking on "Debug: Activate All", ALL checks are actually reachable. Meaning that e.g. 697/697 are reachable, not just some of them.

### Timeouts

When trying to change settings, the "Apply Settings" operation will take 3-6 seconds. be sure to run it with a timeout of at least 10s.
