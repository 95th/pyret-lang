import React from 'react';
import * as control from './control';

export enum EMenu {
  FSBrowser,
  Options,
}

export type FSItemProps = {
  onClick: () => void;
  contents: string;
};

export type FSItemState = {};

export class FSItem extends React.Component<FSItemProps, FSItemState> {
  get contents() {
    return this.props.contents;
  }

  render() {
    return (
      <button onClick={this.props.onClick}
        className="fs-browser-item">
        {this.props.contents}
      </button>
    );
  }
}

type MenuProps = {
  menu: EMenu,
  browsingRoot: boolean,
  traverseUp: () => void,
  browsePath: string[],
  createFSItemPair: (path: string) => [string, any],
  compareFSItemPair: (a: [string, FSItem], b: [string, FSItem]) => number,
  decreaseFontSize: () => void,
  increaseFontSize: () => void,
  resetFontSize: () => void,
  fontSize: number,
};
type MenuState = {
}


export class Menu extends React.Component<MenuProps, MenuState> {
  render() {
    if (this.props.menu === EMenu.FSBrowser) {
      return (
        <div className="menu-content">
          {!this.props.browsingRoot ? (
            <button className="fs-browser-item"
              onClick={this.props.traverseUp}>
              ..
                                            </button>
          ) : (
              null
            )}
          {
            control.fs
              .readdirSync(this.props.browsePath)
              .map(this.props.createFSItemPair)
              .sort(this.props.compareFSItemPair)
              .map((x: [string, FSItem]) => x[1])
          }
        </div>
      );
    } else if (this.props.menu === EMenu.Options) {
      return (
        <div className="menu-content">
          <div className="font-size-options">
            <button className="font-minus"
              onClick={this.props.decreaseFontSize}>
              -
                                            </button>
            <button className="font-label"
              onClick={this.props.resetFontSize}>
              Font ({this.props.fontSize} px)
                                            </button>
            <button className="font-plus"
              onClick={this.props.increaseFontSize}>
              +
                                            </button>
          </div>
        </div>
      );
    }
  }
}
