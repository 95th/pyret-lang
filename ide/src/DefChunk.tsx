import React from 'react';
import { connect, ConnectedProps } from 'react-redux';
import { Controlled as CodeMirror } from 'react-codemirror2';
import { State } from './state';
import {
  Chunk,
  Selection,
  getStartLineForIndex,
  emptyChunk,
  lintSuccessState,
  removeSelection,
  removeAllSelections,
  selectAll,
  isEmptySelection,
  removeSelectedText,
  emptySelection,
  getChunkSelectedText,
  compareLineAndCh,
} from './chunk';
import { Action } from './action';
import { Effect } from './effect';
import { RHSObjects } from './rhsObject';

type StateProps = {
  chunks: Chunk[],
  focusedChunk: number | undefined,
  rhs: RHSObjects,
  firstSelectedChunkIndex: false | number,
};

function mapStateToProps(state: State): StateProps {
  const {
    chunks,
    focusedChunk,
    rhs,
    firstSelectedChunkIndex,
  } = state;
  return {
    chunks,
    focusedChunk,
    rhs,
    firstSelectedChunkIndex,
  };
}

type PropsFromReact = {
  index: number,
  focused: boolean,
};

type DispatchProps = {
  setFocusedChunk: (index: number) => void,
  setChunks: (chunks: Chunk | Chunk[]) => void,
  setChunk: (chunk: Chunk) => void,
  enqueueEffect: (effect: Effect) => void,
  setShouldAdvanceCursor: (value: boolean) => void,
  setRHS: (value: RHSObjects) => void,
  setFirstSelectedChunkIndex: (value: false | number) => void,
};

function mapDispatchToProps(dispatch: (action: Action) => any): DispatchProps {
  return {
    setFocusedChunk(index: number) {
      dispatch({ type: 'update', key: 'focusedChunk', value: index });
    },
    setChunks(chunks: Chunk | Chunk[]) {
      dispatch({ type: 'update', key: 'chunks', value: chunks });
    },
    setChunk(chunk: Chunk) {
      dispatch({ type: 'update', key: 'chunks', value: chunk });
    },
    enqueueEffect(effect: Effect) {
      dispatch({ type: 'enqueueEffect', effect });
    },
    setShouldAdvanceCursor(value: boolean) {
      dispatch({ type: 'update', key: 'shouldAdvanceCursor', value });
    },
    setRHS(value: RHSObjects) {
      dispatch({ type: 'update', key: 'rhs', value });
    },
    setFirstSelectedChunkIndex(value: false | number) {
      dispatch({ type: 'update', key: 'firstSelectedChunkIndex', value });
    },
  };
}

const connector = connect(mapStateToProps, mapDispatchToProps);

type PropsFromRedux = ConnectedProps<typeof connector>;
type DefChunkProps = PropsFromRedux & DispatchProps & StateProps & PropsFromReact;

function deleteSelectedChunks(chunks: Chunk[], index: number): {
  chunks: Chunk[],
  shouldPreventDefault: boolean,
  shouldChangeFocus: boolean,
  firstSelectedChunk: false | number,
} {
  let shouldPreventDefault = false;
  let firstSelectedChunk: false | number = false;

  const updatedChunks = chunks.reduce(
    (newChunks: Chunk[], chunk, i) => {
      const {
        selection,
      } = chunk;

      if (isEmptySelection(selection)) {
        newChunks.push(chunk);
        return newChunks;
      }

      if (firstSelectedChunk === false) {
        firstSelectedChunk = i;
      }

      if (i === index) {
        shouldPreventDefault = true;
      }

      const newChunk = removeSelectedText(chunk);

      if (newChunk.text === '') {
        return newChunks;
      }

      newChunks.push(newChunk);

      return newChunks;
    },
    [],
  );

  const shouldChangeFocus = updatedChunks.length !== chunks.length;

  if (updatedChunks.length === 0) {
    updatedChunks.push(emptyChunk({ errorState: lintSuccessState }));
  }

  for (let i = 0; i < updatedChunks.length; i += 1) {
    updatedChunks[i].startLine = getStartLineForIndex(updatedChunks, i);
  }

  return {
    chunks: updatedChunks,
    shouldChangeFocus,
    shouldPreventDefault,
    firstSelectedChunk,
  };
}

class DefChunk extends React.Component<DefChunkProps, any> {
  private input: React.RefObject<any>;

  constructor(props: DefChunkProps) {
    super(props);
    this.input = React.createRef();
  }

  shouldComponentUpdate(newProps: DefChunkProps) {
    const n = newProps;
    const o = this.props;

    if (n.chunks[n.index].selection !== o.chunks[o.index].selection) {
      return true;
    }

    if (n.index === o.index
      && n.focusedChunk !== n.index) {
      return false;
    }

    if (n.focusedChunk === o.focusedChunk
        && n.chunks[n.index].text === o.chunks[o.index].text
        && n.chunks[n.index].errorState === o.chunks[o.index].errorState) {
      return false;
    }

    return true;
  }

  componentDidUpdate() {
    const {
      chunks,
      index,
    } = this.props;

    const {
      editor,
      errorState,
      startLine,
      selection,
    } = chunks[index];

    if (editor !== false) {
      const doc = editor.getDoc();

      const cmSelectedText = doc.getSelection();
      const selectedText = getChunkSelectedText(chunks[index]);

      if (cmSelectedText !== selectedText) {
        if (isEmptySelection(selection)) {
          doc.setSelection(emptySelection.anchor, emptySelection.head);
        } else {
          doc.setSelection(selection.anchor, selection.head);
        }
      }
    }

    if (editor && errorState.status === 'succeeded') {
      const marks = editor.getDoc().getAllMarks();
      marks.forEach((m) => m.clear());
    } else if (editor && errorState.status === 'failed') {
      const { highlights } = errorState;
      const marks = editor.getDoc().getAllMarks();
      marks.forEach((m) => m.clear());
      if (highlights.length > 0) {
        for (let i = 0; i < highlights.length; i += 1) {
          const doc = editor.getDoc();
          // lint errors are relative to the start of a chunk, compile errors
          // are relative to the start of the program
          if (errorState.effect === 'lint') {
            const [l1, ch1, l2, ch2] = highlights[i];
            doc.markText(
              {
                line: l1 - 1,
                ch: ch1,
              },
              {
                line: l2 - 1,
                ch: ch2,
              },
              { className: 'styled-background-error' },
            );
          } else if (errorState.effect === 'compile') {
            const [l1, ch1, l2, ch2] = highlights[i];
            doc.markText(
              {
                line: l1 - startLine - 1,
                ch: ch1,
              },
              {
                line: l2 - startLine - 1,
                ch: ch2,
              },
              { className: 'styled-background-error' },
            );
          }
        }
      }
    }

    const { focusedChunk } = this.props;
    if (index === focusedChunk && this.input.current !== null) {
      this.input.current.editor.focus();
    }
  }

  scheduleUpdate(value: string) {
    const {
      chunks,
      index,
      setChunks,
      rhs,
      setRHS,
    } = this.props;

    const { editor } = chunks[index];

    if (editor !== false) {
      const marks = editor.getDoc().getAllMarks();
      marks.forEach((m) => m.clear());
    }

    const newChunks = [...chunks];
    newChunks[index] = {
      ...newChunks[index],
      text: value,
      errorState: { status: 'notLinted' },
    };
    for (let i = index; i < newChunks.length; i += 1) {
      newChunks[i] = {
        ...newChunks[i],
        startLine: getStartLineForIndex(newChunks, i),
      };
    }
    setChunks(newChunks);

    if (!rhs.outdated) {
      setRHS({ ...rhs, outdated: true });
    }
  }

  handleArrowUp(editor: any, event: Event) {
    const {
      index,
      setFocusedChunk,
      setShouldAdvanceCursor,
    } = this.props;
    const pos = (editor as any).getCursor();
    if (pos.line === 0 && index > 0) {
      setFocusedChunk(index - 1);
      setShouldAdvanceCursor(false);
      event.preventDefault();
    }
  }

  handleArrowDown(editor: any, event: Event) {
    const {
      index,
      setFocusedChunk,
      chunks,
      setShouldAdvanceCursor,
    } = this.props;
    const pos = (editor as any).getCursor();
    if (pos.line === chunks[index].text.split('\n').length - 1 && index < chunks.length - 1) {
      setFocusedChunk(index + 1);
      setShouldAdvanceCursor(false);
      event.preventDefault();
    }
  }

  handleEnter(editor: any, event: Event) {
    const {
      enqueueEffect,
      setShouldAdvanceCursor,
    } = this.props;
    const pos = (editor as any).getCursor();
    const token = editor.getTokenAt(pos);
    if ((event as any).shiftKey) {
      setShouldAdvanceCursor(false);
      enqueueEffect('saveFile');
      event.preventDefault();
    } else if (token.state.lineState.tokens.length === 0) {
      setShouldAdvanceCursor(true);
      enqueueEffect('saveFile');
      event.preventDefault();
    }
  }

  handleDelete(event: Event) {
    const {
      chunks,
      index,
      setChunks,
      setFocusedChunk,
      focusedChunk,
      enqueueEffect,
    } = this.props;
    if (index === 0 && chunks.length > 1 && chunks[0].text.trim() === '') {
      const newChunks = [...chunks.slice(1, chunks.length)];
      for (let i = 0; i < newChunks.length; i += 1) {
        newChunks[i] = {
          ...newChunks[i],
          startLine: getStartLineForIndex(newChunks, i),
        };
      }
      setChunks(newChunks);
      setFocusedChunk(0);
      event.preventDefault();
    } else if (index > 0 && index < chunks.length - 1 && chunks[index].text.trim() === '') {
      const newChunks = [
        ...chunks.slice(0, index),
        ...chunks.slice(index + 1, chunks.length)];
      for (let i = index; i < newChunks.length; i += 1) {
        newChunks[i] = {
          ...newChunks[i],
          startLine: getStartLineForIndex(newChunks, i),
        };
      }
      setChunks(newChunks);
      event.preventDefault();
    } else {
      const result = deleteSelectedChunks(chunks, index);
      setChunks(result.chunks);

      const {
        shouldPreventDefault,
        shouldChangeFocus,
        firstSelectedChunk,
      } = result;

      if (shouldChangeFocus && firstSelectedChunk !== false) {
        const newFocusedChunk = Math.min(result.chunks.length - 1, firstSelectedChunk + 1);

        if (newFocusedChunk !== focusedChunk) {
          setFocusedChunk(newFocusedChunk);
        } else {
          enqueueEffect('saveFile');
        }
      }
      if (shouldPreventDefault) {
        event.preventDefault();
      }
    }
  }

  handleBackspace(event: Event) {
    const {
      chunks, index, setChunks, setFocusedChunk,
    } = this.props;
    if (index === 0 && chunks.length > 1 && chunks[0].text.trim() === '') {
      const newChunks = [...chunks.slice(1, chunks.length)];
      for (let i = 0; i < newChunks.length; i += 1) {
        newChunks[i] = {
          ...newChunks[i],
          startLine: getStartLineForIndex(newChunks, i),
        };
      }
      setChunks(newChunks);
      setFocusedChunk(0);
      event.preventDefault();
    } else if (index > 0 && chunks[index].text.trim() === '') {
      const newChunks = [
        ...chunks.slice(0, index),
        ...chunks.slice(index + 1, chunks.length)];
      for (let i = index; i < newChunks.length; i += 1) {
        newChunks[i] = {
          ...newChunks[i],
          startLine: getStartLineForIndex(newChunks, i),
        };
      }
      setChunks(newChunks);
      setFocusedChunk(index - 1);
      event.preventDefault();
    } else {
      const result = deleteSelectedChunks(chunks, index);
      setChunks(result.chunks);

      const {
        shouldPreventDefault,
        shouldChangeFocus,
        firstSelectedChunk,
      } = result;

      if (shouldChangeFocus && firstSelectedChunk !== false) {
        setFocusedChunk(Math.max(0, firstSelectedChunk - 1));
      }
      if (shouldPreventDefault) {
        event.preventDefault();
      }
    }
  }

  handleMouseDown(event: any) {
    const {
      index,
      chunks,
      setFocusedChunk,
      setShouldAdvanceCursor,
      setFirstSelectedChunkIndex,
      setChunks,
    } = this.props;
    setShouldAdvanceCursor(false);
    setFocusedChunk(index);

    if (event.buttons !== 1) {
      return;
    }

    const newChunks = removeAllSelections(chunks);
    setChunks(newChunks);
    setFirstSelectedChunkIndex(index);
  }

  handleMouseEnter(e: any) {
    const {
      chunks,
      index,
      firstSelectedChunkIndex,
      setFirstSelectedChunkIndex,
      setChunks,
    } = this.props;

    if (e.buttons !== 1) {
      return;
    }

    if (firstSelectedChunkIndex === false) {
      setFirstSelectedChunkIndex(index);
      setChunks(selectAll(chunks[index]));
    } else if (index <= firstSelectedChunkIndex) {
      // selecting from bottom to the top
      setChunks(chunks.map((chunk, i) => {
        if (i < index || i > firstSelectedChunkIndex) {
          return removeSelection(chunk);
        }

        return selectAll(chunk);
      }));
    } else if (index > firstSelectedChunkIndex) {
      // selecting from top to bottom
      setChunks(chunks.map((chunk, i) => {
        if (i > index || i < firstSelectedChunkIndex) {
          return removeSelection(chunk);
        }

        return selectAll(chunk);
      }));
    }
  }

  handleOnSelection({ ranges, origin }: { ranges: Selection[], origin?: string }) {
    const {
      chunks,
      index,
      setChunks,
    } = this.props;

    if (origin !== '*mouse') {
      // This happens when we manually call setSelection, as opposed to the user
      // selecting text with their mouse.
      return;
    }

    if (ranges.length < 1) {
      return;
    }

    const cmp = compareLineAndCh(chunks[index].text, ranges[0].anchor, ranges[0].head);

    if (cmp <= 0) {
      setChunks({
        ...chunks[index],
        selection: { anchor: ranges[0].anchor, head: ranges[0].head },
      });
    } else {
      setChunks({
        ...chunks[index],
        selection: { anchor: ranges[0].head, head: ranges[0].anchor },
      });
    }
  }

  render() {
    const {
      chunks, index, focusedChunk,
    } = this.props;
    const { text, startLine } = chunks[index];

    return (
      <div
        style={{
          width: '100%',
          display: 'flex',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 0,
            height: '100%',
          }}
        >
          {(() => {
            const chunk = chunks[index];

            if (chunk.errorState.status === 'failed'
          && focusedChunk === index) {
              return (
                <div style={{
                  alignSelf: 'center',
                  background: '#FFF2F2',
                  position: 'absolute',
                  top: '100%',
                  width: '40em',
                  zIndex: 500001,
                  fontFamily: 'sans-serif',
                  borderRadius: '3px',
                  border: '0.3em solid hsl(204, 100%, 74%)',
                  padding: '0.2em',
                  marginRight: '1em',
                  boxShadow: '0 0 1em',
                }}
                >
                  {chunk.errorState.failures}
                </div>
              );
            }

            return false;
          })()}
        </div>
        <div
          style={{
            width: '100%',
          }}
          onMouseEnter={(event: any) => {
            this.handleMouseEnter(event);
          }}
        >
          <CodeMirror
            ref={this.input}
            onMouseDown={(editor: any, e: any) => {
              this.handleMouseDown(e);
            }}
            editorDidMount={(editor) => {
              const { setChunk } = this.props;

              const marks = editor.getDoc().getAllMarks();
              marks.forEach((m) => m.clear());
              editor.setSize(null, 'auto');

              setChunk({ ...chunks[index], editor });
            }}
            value={text}
            options={{
              mode: 'pyret',
              theme: 'default',
              lineNumbers: true,
              lineWrapping: true,
              lineNumberFormatter: (l) => String(l + startLine),
              autofocus: index === focusedChunk,
            }}
            onBeforeChange={(editor, data, value) => {
              this.scheduleUpdate(value);
            }}
            onSelection={(editor, data) => {
              this.handleOnSelection(data);
            }}
            onKeyDown={(editor, event) => {
              switch ((event as any).key) {
                case 'Enter':
                  this.handleEnter(editor, event);
                  break;
                case 'Backspace':
                  this.handleBackspace(event);
                  break;
                case 'Delete':
                  this.handleDelete(event);
                  break;
                case 'ArrowUp':
                  this.handleArrowUp(editor, event);
                  break;
                case 'ArrowDown':
                  this.handleArrowDown(editor, event);
                  break;
                default:
              }
            }}
            autoCursor
          />
        </div>
      </div>
    );
  }
}

export default connector(DefChunk);
