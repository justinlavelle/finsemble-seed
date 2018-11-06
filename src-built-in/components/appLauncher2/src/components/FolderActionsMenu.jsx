/*!
* Copyright 2018 by ChartIQ, Inc.
* All rights reserved.
*
*/

import React from 'react'
import storeActions from '../stores/StoreActions'

class FolderActionsMenu extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			isVisible: false
		};
		this.bindCorrectContext()
	}
	bindCorrectContext() {
		this.toggleMenu = this.toggleMenu.bind(this);
		this.renameFolder = this.renameFolder.bind(this);
		this.launchAll = this.launchAll.bind(this);
		this.deleteFolder = this.deleteFolder.bind(this);
		this.setMenuRef = this.setMenuRef.bind(this);
		this.handleClickOutside = this.handleClickOutside.bind(this);
	}
	componentDidMount() {
		document.addEventListener('mousedown', this.handleClickOutside);
	}
	componentWillUnmount() {
		document.removeEventListener('mousedown', this.handleClickOutside);
	}
	toggleMenu() {
		this.setState({
			isVisible: !this.state.isVisible
		})
	}

	renameFolder() {
		this.props.renameFolder(this.props.folder);
	}
	
	launchAll() {
		let folders = storeActions.getFolders()
		let folder = folders.find((folder) => {
			return folder.name === this.props.folder.name;
		});

		for (let i = 0; i < folder.appDefinitions.length; i++) {
			let app = folder.appDefinitions[i];
			FSBL.Clients.LauncherClient.showWindow({
				componentType: app.name
			}, {
				monitor: 'mine',
				staggerPixels: 5,
				spawnIfNotFound: true,
				left: "center",
				right: "center"
			});
		}
	}

	deleteFolder(event) {
		//storeActions.deleteFolder(this.props.folder)
	}
	setMenuRef(node) {
		this.menuRef = node;
	}
	handleClickOutside(e) {
		if (this.menuRef && !this.menuRef.contains(e.target)) {
			this.setState({
				isVisible: false
			});
		}
	}
	renderList() {
		return (
			<div className="folder-actions-menu" style={{ right: 0 }}>
				<ul>
					<li onClick={this.renameFolder}>Rename</li>
					<li onClick={this.launchAll}>Launch All</li>
					<li onClick={this.deleteFolder}>Delete Folder</li>
				</ul>
			</div>
		);
	}
	render() {
		return (
			<div ref={this.setMenuRef} className="folder-actions-menu-wrapper" onClick={this.toggleMenu}>
				<span><i className="ff-dots-vert" /></span>
				{this.state.isVisible && this.renderList()}
			</div>
		);
	}
}

export default FolderActionsMenu;