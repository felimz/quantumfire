/// <reference types="vite/client" />

// Vite ?worker imports resolve to a class constructor that returns a Worker
declare module "*?worker" {
  const workerConstructor: {
    new (): Worker;
  };
  export default workerConstructor;
}
