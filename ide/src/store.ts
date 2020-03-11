import { createStore } from 'redux';
import { ideApp } from './reducers';
import { CompileState } from './State';
import * as control from './control';

export const store = createStore(
  ideApp,
  (window as any).__REDUX_DEVTOOLS_EXTENSION__ && (window as any).__REDUX_DEVTOOLS_EXTENSION__()
);

function handleLog(message: string): void {
  console.log("log");
  console.log(message);
}

function handleSetupFinished(): void {
  console.log("setup finished");
  store.dispatch({ type: "finishSetup"} )
}

function handleCompileFailure(errors: string[]): void {
  console.log("compile failure");
  store.dispatch({
    type: "textCompileFailure",
    errors
  });
}

function handleRuntimeFailure(errors: string[]): void {
  console.log("runtime failure");
  store.dispatch({
    type: "textRunFailure",
    errors
  })
}

function handleLintFailure(lintFailure: { name: string, errors: string[] }): void {
  console.log("lint failure");
  store.dispatch({
    type: "textLintFailure",
    lintFailure
  })
}

function handleLintSuccess(lintSuccess: { name: string }): void {
  console.log("lint success");
  store.dispatch({
    type: "textLintSuccess",
    lintSuccess
  })
}

function handleCompileSuccess(): void {
  console.log("compile success");
  store.dispatch({
    type: "textCompileSuccess"
  });
}

function handleCreateReplSuccess(): void {
  console.log("create repl succes (nyi)");
}

function handleCompileInteractionSuccess(): void {
  console.log("compile interaction success (nyi)");
}

function handleCompileInteractionFailure(): void {
  console.log("compile interaction failure (nyi)");
}

store.subscribe(() => {
  const state = store.getState();
  console.log(`subscription called, current state is ${CompileState[state.compileState]}`);

  if (state.needLoadFile && state.currentFile !== undefined) {
    store.dispatch({
      type: "textUpdateContents",
      contents: control.openOrCreateFile(state.currentFile)
    });
  }

  switch (state.compileState) {
    case CompileState.TextNeedsStartup:
      control.setupWorkerMessageHandler(
        handleLog,
        handleSetupFinished,
        handleCompileFailure,
        handleRuntimeFailure,
        handleLintFailure,
        handleLintSuccess,
        handleCompileSuccess,
        handleCreateReplSuccess,
        handleCompileInteractionSuccess,
        handleCompileInteractionFailure,
      );
      store.dispatch({ type: "startupCompleted" });
      return;
    case CompileState.TextReadyQueue:
      console.log("current contents", state.currentFileContents);
      const parsed = control.bfsSetup.path.parse(state.currentFile);
      control.fs.writeFileSync(
        state.currentFile,
        state.currentFileContents);
      control.compile(
        parsed.dir,
        parsed.base,
        state.typeCheck);
      store.dispatch({ type: "textCompile" });
      return;
    case CompileState.TextNeedsRun:
      store.dispatch({ type: "textRunStarted" });
      control.run(
        control.path.runBase,
        control.path.runProgram,
        (runResult: any) => {
          store.dispatch({ type: "textRunFinished", result: runResult });
        },
        (runner: any) => {
          store.dispatch({ type: "updateRunner", runner });
        },
        control.backend.RunKind.Async);
    default:
      return;
  }
});

store.dispatch({ type: "expandChild", path: "/projects/program.arr" });
