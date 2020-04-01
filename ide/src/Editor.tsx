import React from 'react';
import './App.css';
import { connect, ConnectedProps } from 'react-redux';
import SplitterLayout from 'react-splitter-layout';
import * as State from './state';
import { EditorMode, LintFailure } from './state';
import Interaction from './Interaction';
import { TestResult } from './Check';
import DefChunks from './DefChunks';
import SingleCodeMirrorDefinitions from './SingleCodeMirrorDefinitions';
import Menu from './Menu';
import Tab from './Tab';
import Footer from './Footer';
// import { FontSize } from './FontSize';
import FSBrowser from './FSBrowser';
// import { Dropdown, DropdownOption } from './Dropdown';
import Header from './Header';
import InteractionError from './InteractionError';
import * as control from './control';
import 'react-splitter-layout/lib/index.css';
import * as action from './action';

type stateProps = {
  browseRoot: string,
  browsePath: string[],
  currentFileContents: string,
  definitionsHighlights: number[][],
  fontSize: number,
  stopify: boolean,
  compileState: State.CompileState,
  checks: any[],
  interactions: { key: any, name: any, value: any }[],
  interactionErrors: any[],
  editorMode: EditorMode,
  lintFailures: {[name : string]: LintFailure},
  currentFile: string,
  chunks: string[]
};

function mapStateToProps(state: State): stateProps {
  return {
    browseRoot: state.browseRoot,
    browsePath: state.browsePath,
    currentFileContents: state.currentFileContents,
    definitionsHighlights: state.definitionsHighlights,
    fontSize: state.fontSize,
    stopify: state.runKind === control.backend.RunKind.Async,
    compileState: state.compileState,
    checks: state.checks,
    interactions: state.interactions,
    interactionErrors: state.interactionErrors,
    editorMode: state.editorMode,
    lintFailures: state.lintFailures,
    currentFile: state.currentFile,
    chunks: state.chunks,
  };
}

type dispatchProps = {
  beginStartup: () => void,
  queueRun: () => void,
  stop: () => void,
  run: () => void,
  updateContents: (contents: string) => void,
  updateChunkContents: (index: number, contents: string) => void,
  setEditorMode: (mode: EditorMode) => void,
};

function mapDispatchToProps(dispatch: (action: action.Action) => any): dispatchProps {
  return {
    beginStartup: () => dispatch({ type: 'beginStartup' }),
    queueRun: () => dispatch({ type: 'queueRun' }),
    stop: () => dispatch({ type: 'stop' }),
    run: () => dispatch({ type: 'run' }),
    updateContents: (contents: string) => dispatch({ type: 'updateContents', contents }),
    updateChunkContents: (index: number, contents: string) => {
      dispatch({ type: 'updateChunkContents', index, contents });
    },
    setEditorMode: (mode: EditorMode) => {
      dispatch({ type: 'setEditorMode', mode });
    },
  };
}

const connector = connect(mapStateToProps, mapDispatchToProps);

type PropsFromRedux = ConnectedProps<typeof connector>;

control.installFileSystem();
control.loadBuiltins();

// type EditorProps = {};

type EditorProps = PropsFromRedux & dispatchProps & stateProps;

export class Editor extends React.Component<EditorProps, any> {
  // run = State.handleRun(this)
  // update = State.handleUpdate(this)
  // onTextEdit = State.handleTextEdit(this)
  // onChunkEdit = State.handleChunkEdit(this)
  // onTraverseDown = State.handleTraverseDown(this)
  // onTraverseUp = State.handleTraverseUp(this)
  // onExpandChild = State.handleExpandChild(this)
  // setEditorMode = State.handleSetEditorMode(this)
  // toggleDropdownVisibility = State.handleToggleDropdownVisibility(this)
  // toggleAutoRun = State.handleToggleAutoRun(this)
  // toggleStopify = State.handleToggleStopify(this)
  // toggleTypeCheck = State.handleToggleTypeCheck(this)
  // onDecreaseFontSize = State.handleDecreaseFontSize(this)
  // onIncreaseFontSize = State.handleIncreaseFontSize(this)
  // onResetFontSize = State.handleResetFontSize(this)
  // removeDropdown = State.handleRemoveDropdown(this)
  // setMessage = State.handleSetMessage(this)
  // stop = State.handleStop(this)

  // get isPyretFile() {
  //    return /\.arr$/.test(this.currentFile);
  // }

  // get currentFile() {
  //    return control.bfsSetup.path.join(
  //        ...this.state.currentFileDirectory,
  //        this.state.currentFileName);
  // }

  // get currentFileName() {
  //    return this.state.currentFileName;
  // }

  // get currentFileDirectory() {
  //    return control.bfsSetup.path.join(...this.state.currentFileDirectory);
  // }

  // get stopify() {
  //    return this.state.runKind === control.backend.RunKind.Async;
  // }

  // loadBuiltins = (e: React.MouseEvent<HTMLElement>): void => {
  //    control.loadBuiltins();
  // };

  // removeRootDirectory = (e: React.MouseEvent<HTMLElement>): void => {
  //    control.removeRootDirectory();
  // };

  makeHeaderButton = (text: string, enabled: boolean, onClick: () => void) => (
    <button
      className={(enabled ? 'run-option-enabled' : 'run-option-disabled')}
      onClick={onClick}
      type="button"
    >
      {text}
    </button>
  );

  makeDefinitions() {
    const {
      editorMode,
      currentFileContents,
      updateContents,
      definitionsHighlights,
      chunks,
      lintFailures,
      currentFile,
      updateChunkContents,
    } = this.props;

    if (editorMode === EditorMode.Text) {
      return (
        <SingleCodeMirrorDefinitions
          text={currentFileContents}
          onEdit={(contents: string) => updateContents(contents)}
          highlights={definitionsHighlights}
        />
      );
    }

    if (editorMode === EditorMode.Chunks) {
      console.log(chunks);
      return (
        <DefChunks
          lintFailures={lintFailures}
          name={currentFile}
          highlights={definitionsHighlights}
          chunks={chunks}
          onEdit={(index: number, contents: string) => {
            updateChunkContents(index, contents);
          }}
        />
      );
    }

    throw new Error('Unknown editor mode');
  }

  render() {
    const {
      fontSize,
      checks,
      interactions,
      setEditorMode,
      interactionErrors,
      stopify,
      compileState,
      stop,
      run,
    } = this.props;

    const interactionValues = (
      <div style={{ fontSize }}>
        <pre className="checks-area">
          { checks && checks.map((c: any) => <TestResult check={c} />)}
        </pre>
        <pre className="interactions-area">
          {
            interactions.map(
              (i: any) => (
                <Interaction
                  key={i.key}
                  name={i.name}
                  value={i.value}
                />
              ),
            )
          }
        </pre>
      </div>
    );

    /* const dropdown = this.state.dropdownVisible && (
     *     <Dropdown>
     *         <DropdownOption enabled={this.state.autoRun}
     *                         onClick={this.toggleAutoRun}>
     *             Auto Run
     *         </DropdownOption>
     *         <DropdownOption enabled={this.stopify}
     *                         onClick={this.toggleStopify}>
     *             Stopify
     *         </DropdownOption>
     *         <DropdownOption enabled={this.state.typeCheck}
     *                         onClick={this.toggleTypeCheck}>
     *             Type Check
     *         </DropdownOption>
     *     </Dropdown>);
     */
    /* const fontSize =
     *     <FontSize onIncrease={this.onIncreaseFontSize}
     *               onDecrease={this.onDecreaseFontSize}
     *               onReset={this.onResetFontSize}
     *               size={this.state.fontSize}
     *               key="FontSize">
     *     </FontSize>;
     */

    const textEditor = (
      <button
        className="text-editor"
        onClick={() => setEditorMode(EditorMode.Text)}
        key="TextEditor"
        type="button"
      >
        Text
      </button>
    );

    const chunkEditor = (
      <button
        className="chunk-editor"
        onClick={() => setEditorMode(EditorMode.Chunks)}
        key="ChunkEditor"
        type="button"
      >
        Chunks
      </button>
    );

    /* const builtinsLoader =
     *     <button onClick={control.loadBuiltins}>
     *         Load Builtins
     *     </button>;
     */
    const menu = (
      <Menu>
        <Tab name="📁">
          <FSBrowser />
        </Tab>
        <Tab name="⚙">
          {textEditor}
          {chunkEditor}
          {/* {builtinsLoader}
              {fontSize} */}
        </Tab>
      </Menu>
    );

    const rightHandSide = (
      <div className="interactions-area-container">
        {interactionErrors.length > 0 ? (
          <SplitterLayout
            vertical
            percentage
          >
            {interactionValues}
            <InteractionError fontSize={fontSize}>
              {interactionErrors}
            </InteractionError>
          </SplitterLayout>
        ) : interactionValues}
      </div>
    );

    const definitions = this.makeDefinitions();

    return (
      <div className="page-container">
        <Header>
          {stopify && compileState === State.CompileState.RunningWithStops ? (
            <button
              className="stop-available"
              onClick={stop}
              type="button"
            >
              Stop
            </button>
          ) : (
            <button
              className="stop-unavailable"
              type="button"
            >
              Stop
            </button>
          )}
          <div className="run-container">
            <button
              className="run-ready"
              type="button"
              onClick={run}
            >
              Run
            </button>
            {/* <button className="run-options"
                onClick={this.props.toggleDropdownVisibility}
                onBlur={this.props.removeDropdown}>&#8628;{dropdown}
                </button> */}
          </div>
        </Header>
        <div className="code-container">
          {menu}
          <SplitterLayout
            vertical={false}
            percentage
          >
            <div
              className="edit-area-container"
              style={{ fontSize }}
            >
              {definitions}
            </div>
            {rightHandSide}
          </SplitterLayout>
        </div>
        <Footer message={State.compileStateToString(compileState)} />
      </div>
    );
  }
}

export default connector(Editor);
