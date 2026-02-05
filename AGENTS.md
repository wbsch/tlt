### Basic instructions

The version of this app is already running at http://localhost:5173/ - the user already manually started "npm run dev". For debugging the app in the browser, use the Chrome MCP extension.

Try to find problems, fix them, then make sure they are actually fixed in the browser by reloading and trying to reproduce the problems again. Keep trying unless they are definitely fixed.

The root "OoTMM" folder is the OoTMM randomizer. NEVER change code in there. Treat it like an external library. It is its own external git repository.

### Common operations

Testing reachability of checks: `npx tsx test_reachability.ts`

Feel free to temporarily edit `test_reachability.ts` in order to test other things, or use it as a blueprint for a similar file.

Always make sure the build still runs successfully before you're done: Run `npm run build`

Before returning control to the user, also make sure that when clicking on "Debug: Activate All", ALL checks are actually reachable. Meaning that e.g. 697/697 are reachable, not just some of them.

### Timeouts

When trying to change settings, the "Apply Settings" operation will take 3-6 seconds. be sure to run it with a timeout of at least 10s.
