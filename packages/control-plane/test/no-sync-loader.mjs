// START-3: simulates a Worker for a test process: no synchronous loader for the lazy reference library (node --import this file). A read before referenceLibraryReady() is awaited then throws, as it would in a Worker.
delete process.getBuiltinModule;
