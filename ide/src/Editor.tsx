import React from 'react';
import './App.css';
import { connect, ConnectedProps } from 'react-redux';
import SplitterLayout from 'react-splitter-layout';
import { Chunk } from './chunk';
import * as State from './state';
import { EditorMode } from './state';
import RHS from './RHS';
import DefChunks from './DefChunks';
import SingleCodeMirrorDefinitions from './SingleCodeMirrorDefinitions';
import Menu from './Menu';
import MenuBar from './MenuBar';
import Footer from './Footer';
import Dropdown from './Dropdown';
import DropdownOption from './DropdownOption';
import Header from './Header';
import InteractionError from './InteractionError';
import * as control from './control';
import 'react-splitter-layout/lib/index.css';
import * as action from './action';

type StateProps = {
  browseRoot: string,
  currentFileContents: undefined | string,
  definitionsHighlights: number[][],
  fontSize: number,
  stopify: boolean,
  interactionErrors: any[],
  editorMode: EditorMode,
  chunks: Chunk[],
  running: boolean,
  compiling: boolean | 'out-of-date',
  linting: boolean,
  dropdownVisible: boolean,
  autoRun: boolean,
  typeCheck: boolean,
};

function mapStateToProps(state: State.State): StateProps {
  return {
    browseRoot: state.browseRoot,
    currentFileContents: state.currentFileContents,
    definitionsHighlights: state.definitionsHighlights,
    fontSize: state.fontSize,
    stopify: state.runKind === control.backend.RunKind.Async,
    interactionErrors: state.interactionErrors,
    editorMode: state.editorMode,
    chunks: state.chunks,
    running: state.running,
    compiling: state.compiling,
    linting: state.linting,
    dropdownVisible: state.dropdownVisible,
    autoRun: state.autoRun,
    typeCheck: state.typeCheck,
  };
}

type DispatchProps = {
  stop: () => void,
  run: () => void,
  updateContents: (contents: string) => void,
  setEditorMode: (mode: EditorMode) => void,
  setAutoRun: (autoRun: boolean) => void,
  setStopify: (stopify: boolean) => void,
  setTypeCheck: (typeCheck: boolean) => void,
  setDropdownVisible: (dropdownVisible: boolean) => void,
};

function mapDispatchToProps(dispatch: (action: action.Action) => any): DispatchProps {
  return {
    stop: () => dispatch({ type: 'enqueueEffect', effect: 'stop' }),
    run: () => dispatch({ type: 'enqueueEffect', effect: 'saveFile' }),
    updateContents: (contents: string) => dispatch({
      type: 'update',
      key: 'currentFileContents',
      value: contents,
    }),
    setEditorMode: (mode: EditorMode) => {
      dispatch({ type: 'update', key: 'editorMode', value: mode });
    },
    setAutoRun: (autoRun: boolean) => {
      dispatch({ type: 'update', key: 'autoRun', value: autoRun });
    },
    setStopify: (stopify: boolean) => {
      if (stopify) {
        dispatch({ type: 'update', key: 'runKind', value: control.backend.RunKind.Async });
      } else {
        dispatch({ type: 'update', key: 'runKind', value: control.backend.RunKind.Sync });
      }
    },
    setTypeCheck: (typeCheck: boolean) => {
      dispatch({ type: 'update', key: 'typeCheck', value: typeCheck });
    },
    setDropdownVisible: (dropdownVisible: boolean) => {
      dispatch({ type: 'update', key: 'dropdownVisible', value: dropdownVisible });
    },
  };
}

const connector = connect(mapStateToProps, mapDispatchToProps);

type PropsFromRedux = ConnectedProps<typeof connector>;

control.installFileSystem();
control.loadBuiltins();

// type EditorProps = {};

type EditorProps = PropsFromRedux & DispatchProps & StateProps;

export class Editor extends React.Component<EditorProps, any> {
  componentDidMount() {
    document.body.addEventListener('copy', this.makeCopyHandler());
  }

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
    } = this.props;

    if (editorMode === EditorMode.Text) {
      return (
        <SingleCodeMirrorDefinitions
          text={currentFileContents || ''}
          onEdit={(contents: string) => updateContents(contents)}
          highlights={definitionsHighlights}
        />
      );
    }

    if (editorMode === EditorMode.Chunks) {
      return (
        <DefChunks />
      );
    }

    throw new Error('Unknown editor mode');
  }

  makeCopyHandler() {
    const that = this;

    return (e: any) => {
      const {
        chunks,
        editorMode,
      } = that.props;

      if (editorMode === EditorMode.Text) {
        // We can rely on the browser's native copy here, since there's only one CodeMirror.
        return;
      }

      let data = '';

      chunks.forEach((chunk, i) => {
        const { editor } = chunk;

        if (editor === false) {
          return;
        }

        const doc = editor.getDoc();
        const selection = doc.getSelection();

        if (selection === '') {
          return;
        }

        data += selection;

        if (i !== chunks.length - 1) {
          data += '#.CHUNK#\n';
        }
      });

      e.clipboardData.setData('text/plain', data);
      e.preventDefault();
    };
  }

  render() {
    const {
      compiling,
      linting,
      fontSize,
      interactionErrors,
      stopify,
      stop,
      run,
      running,
      dropdownVisible,
      autoRun,
      typeCheck,
      setAutoRun,
      setStopify,
      setTypeCheck,
      setDropdownVisible,
    } = this.props;

    const interactionValues = (
      <RHS />
    );

    const dropdown = dropdownVisible && (
      <Dropdown>
        <DropdownOption
          enabled={autoRun}
          onClick={() => setAutoRun(!autoRun)}
        >
          Auto Run
        </DropdownOption>
        <DropdownOption
          enabled={stopify}
          onClick={() => setStopify(!stopify)}
        >
          Stopify
        </DropdownOption>
        <DropdownOption
          enabled={typeCheck}
          onClick={() => setTypeCheck(!typeCheck)}
        >
          Type Check
        </DropdownOption>
      </Dropdown>
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
              {(() => {
                if (interactionErrors.length === 1
                        && interactionErrors[0] === 'Could not find module with uri: builtin://global') {
                  return ['The first line of your program should be `import global as G`'];
                }
                return interactionErrors;
              })()}
            </InteractionError>
          </SplitterLayout>
        ) : interactionValues}
      </div>
    );

    const definitions = this.makeDefinitions();

    return (
      <div className="page-container">
        <Header>
          <div>
            <MenuBar />
          </div>
          <div
            style={{
              height: '100%',
            }}
          >
            {stopify && running ? (
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
            <div
              className="run-container"
            >
              <button
                className="run-ready"
                type="button"
                onClick={run}
                style={{
                  background: compiling || running || linting ? 'gray' : '#317bcf',
                }}
              >
                Run
              </button>
              <button
                type="button"
                className="run-options"
                onClick={() => setDropdownVisible(!dropdownVisible)}
                onBlur={() => setDropdownVisible(false)}
                style={{
                  background: compiling || running || linting ? 'gray' : '#317bcf',
                }}
              >
                &#8628;
                {dropdown}
              </button>
            </div>
          </div>
        </Header>
        <div className="code-container">
          <Menu />
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
        <Footer />
      </div>
    );
  }
}

export default connector(Editor);
