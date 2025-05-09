import { getCookie, setCookie, delCookie, redirectToSkappContainer, popupCenter,
	toggleElementsDisplay, showOverlay, hideOverlay, toHexString, isOptionSet, isOptionTrue } from "./utils"
import { encryptFile, decryptFile, fetchFile } from "./encrypt"
import { SkynetClient, genKeyPairFromSeed, deriveChildSeed, getRelativeFilePath, getRootDirectory, defaultPortalUrl } from "skynet-js"
import { SlowBuffer } from "buffer";
const sia = require('sia-js')

export class SkyID {
	constructor(appId, callback = null, opts = null) {
		// delete skyid cookie if set
		document.cookie = "skyid=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";


		this.callback = callback
		this.appId = appId
		this.opts = opts

		let cookie = getCookie()
		this.setAccount(cookie)


		if (isOptionTrue('devMode', this.opts)) {
			console.log('devMode on, using https://siasky.net')
			this.skynetClient = new SkynetClient('https://siasky.net', this.opts)
			let html = `<div id="deprecated_warn" style="position: fixed; top: 0; transform: translateX(-50%); left: 50%; background-color: #B71C1C; padding: 5px 20px; opacity: 0.5; z-index: 99999; color: white; font-size: 80%;">
					<span style="float:right; padding-left: 10px; cursor: pointer;" onclick="document.getElementById('deprecated_warn').style.display = 'none'">x</span>
					DevMode is on -
					<a href="https://github.com/DaWe35/SkyID/blob/main/README.md#development" target="_blank" style="color: lightblue;">More info</a>
				</div>`
			var div = document.createElement("div")
			div.innerHTML = html
			document.body.appendChild(div.firstChild)
		} else {
			console.log('devMode off, using auto portal')
			this.skynetClient = new SkynetClient('https://siasky.net', this.opts)
		}

		window.addEventListener("message", (event) => {
			if (typeof event.data.sender != 'undefined' && event.data.sender == 'skyid') {
				if (event.data.eventCode == 'login_success') {
					setCookie(event.data.appData, 1)
					this.setAccount(event.data.appData)
				}
				typeof this.callback === 'function' && this.callback(event.data.eventCode)
			}
		}, false)

		// Load "loading" css
		var head = document.getElementsByTagName('HEAD')[0]
		var link = document.createElement('link')
		link.rel = 'stylesheet'
		link.type = 'text/css'
		if (isOptionSet('customSkyidUrl', this.opts)) {
			link.href = this.opts.customSkyidUrl + '/assets/css/loading.css'
			console.log('CSS url set to', this.opts.customSkyidUrl)
		} else if (isOptionTrue('devMode', this.opts)) {
			link.href = 'https://sky-id.hns.siasky.net/assets/css/loading.css'
			console.log('CSS url set to sky-id.hns.siasky.net')
		} else {
			link.href = 'https://sky-id.hns.siasky.net/assets/css/loading.css'
			console.log('CSS url set to sky-id.hns.siasky.net')
		}

		head.appendChild(link)
	}

	sessionStart() {
		let redirect = redirectToSkappContainer(window.location)
		let devMode = isOptionTrue('devMode', this.opts)
		if (redirect == null && !devMode) {
			alert('Error: unable to detect dapp container URL')
		} else {
			if (redirect != false && !devMode) {
				window.location.href = redirect
			}

			if (devMode) {
				var devModeString = '&devMode=true'
			} else {
				var devModeString = ''
			}
			if (isOptionSet('customSkyidUrl', this.opts)) {
				console.log('Connect url set to', this.opts.customSkyidUrl)
				window.windowObjectReference = popupCenter(
					this.opts.customSkyidUrl + '/connect.html?appId=' + this.appId + devModeString,
					'SkyID',
					400, 500
				)
			} else {
				console.log('Connect url set to sky-id.hns.siasky.net')
				window.windowObjectReference = popupCenter(
					'https://sky-id.hns.siasky.net/connect.html?appId=' + this.appId + devModeString,
					'SkyID',
					400, 500
				)
			}
		}
	}


	sessionDestroy(redirectUrl = null) {
		delCookie()
		this.setAccount(false)
		if (redirectUrl !== null) {
			window.location.href = redirectUrl
		}
		typeof this.callback === 'function' && this.callback('destroy')
	}



	deriveChildSeed(derivatePath) {
		if (isOptionSet('customChildSeed', this.opts)) {
			return this.opts.customChildSeed
		} else {
			return deriveChildSeed(this.seed, String(derivatePath))
		}
	}

	// alias for compatibility
	async getFile(dataKey, callback) {
		this.getJSON(dataKey, callback)
	}
	async setFile(dataKey, json, callback) {
		this.setJSON(dataKey, json, callback)
	}

	async getJSON(dataKey, callback) {
		showOverlay(this.opts)
		const { publicKey, privateKey } = genKeyPairFromSeed(this.seed)
		try {
			var { data, revision } = await this.skynetClient.db.getJSON(publicKey, dataKey)
		} catch (error) {
			console.log(error)
			console.log('running fixDoubleEncodedJSON')
			var { data, revision } = await this.fixDoubleEncodedJSON(dataKey)
		}
		hideOverlay(this.opts)
		callback(data, revision)
	}

	async fixDoubleEncodedJSON(dataKey) {
		showOverlay(this.opts)
		const { publicKey, privateKey } = genKeyPairFromSeed(this.seed)
		try {
			console.log('dataKey', dataKey)
			console.log('publicKey', publicKey)
			let entry = await this.skynetClient.registry.getEntry(publicKey, dataKey)
			let fileContent = await this.skynetClient.getFileContent(entry.entry.data)
			console.log('fileContent.data', fileContent.data)
			let contentObj = JSON.parse(fileContent.data)
			await this.skynetClient.db.setJSON(privateKey, dataKey, contentObj)
			var { data, revision } = await this.skynetClient.db.getJSON(publicKey, dataKey)
		} catch (error) {
			console.log(error)
			var data = null
			var revision = null
		}
		hideOverlay(this.opts)
		return { 'data': data, 'revision': revision }
	}

	async setJSON(dataKey, json, callback) {
		showOverlay(this.opts)
		const { publicKey, privateKey } = genKeyPairFromSeed(this.seed)
		try {
			await this.skynetClient.db.setJSON(privateKey, dataKey, json)
			var success = true
		} catch (error) {
			console.log(error)
			alert('Failed to save file, please retry.')
			var success = false
		}
		hideOverlay(this.opts)
		callback(success)
	}

	async getRegistry(dataKey, callback) {
		showOverlay(this.opts)
		const { publicKey, privateKey } = genKeyPairFromSeed(this.seed)
		try {
			var entry = await this.skynetClient.registry.getEntry(publicKey, dataKey)
		} catch (error) {
			var entry = false
		}
		hideOverlay(this.opts)
		callback(entry)
	}

	async setRegistry(dataKey, skylink, callback, revision = null) {
		showOverlay(this.opts)
		const { publicKey, privateKey } = genKeyPairFromSeed(this.seed)
		if (revision === null) {
			// fetch the current value to find out the revision.
			
			try {
				let entry = await this.skynetClient.registry.getEntry(publicKey, dataKey)
				console.log('entry', entry)
				revision = entry.entry.revision + BigInt(1)
			} catch (err) {
				console.log(err)
				revision = 0
			}
		}

		// build the registry value
		const newEntry = {
			datakey: dataKey,
			data: skylink,
			revision,
		}

		console.log('privateKey', privateKey)
		console.log('newEntry', newEntry)

		// update the registry
		try {
			await this.skynetClient.registry.setEntry(privateKey, newEntry)
			var success = true
		} catch (error) {
			console.log(error)
			alert('Failed to save entry, please retry.')
			var success = false
		}

		callback(success)
	}

	getRegistryUrl(dataKey) {
		const { publicKey, privateKey } = genKeyPairFromSeed(this.seed)
		return this.skynetClient.registry.getEntryUrl(publicKey, dataKey)
	}

	// files can be an array, for example document.getElementById('my_input').files
	async uploadDirectory(files, callback) {
		showOverlay(this.opts)
		try {
			 // Get the directory name from the list of files.
			// Can also be named manually, i.e. if you build the files yourself
			// instead of getting them from an input form.
			const filename = getRootDirectory(files[0])

			// Use reduce to build the map of files indexed by filepaths
			// (relative from the directory).

			const directory = files.reduce((accumulator, file) => {
				const path = getRelativeFilePath(file)

				return { ...accumulator, [path]: file }
			}, {})
			var skylink = await this.skynetClient.uploadDirectory(directory, 'uploaded_folder_name')
		} catch (error) {
			var skylink = false
			console.log(error)
		}

		hideOverlay(this.opts)
		callback(skylink)
	}

	async uploadEncryptedFile(file, keyDerivationPath, callback) {
		showOverlay(this.opts)
		var encryptSeed = this.deriveChildSeed(keyDerivationPath) // this hash will used as decription key

		var self = this
		encryptFile(file, encryptSeed, async function (encryptedFile) {
			
			const url = URL.createObjectURL(encryptedFile)
			try {
			  var skylink = await self.skynetClient.uploadFile(encryptedFile)
			} catch (error) {
			  console.log(error)
			  var skylink = false
			}
			
			hideOverlay(self.opts)
			callback(skylink)
		})
	}

	async downloadEncryptedFile(skylink, keyDerivationPath, callback) {
		showOverlay(this.opts)
		let fileUrl = this.skynetClient.getSkylinkUrl(skylink)
		var self = this
		
		fetchFile(fileUrl, 'Marstorage', function (file) {
			let encryptSeed = self.deriveChildSeed(keyDerivationPath) // this hash will used as decription key
			decryptFile(file, encryptSeed, function(decryptedFileBlobUrl) {
				hideOverlay(self.opts)
				callback(decryptedFileBlobUrl)
			})
		}, function(progress) {
			if (isOptionSet('onUploadProgress', self.opts)) {
				self.opts.onUploadProgress(progress)
			}
		})
	}

	defaultPortalUrl() {
		return defaultPortalUrl()
	}

	signData(data, childSecKey) {
		// NOT IMPLEMENTED YET
	}

	validateMessage(signedMessage, masterPubKey, childPath) {
		// NOT IMPLEMENTED YET
	}

	showOverlay() {
		showOverlay(this.opts)
	}

	hideOverlay() {
		hideOverlay(this.opts)
	}

	async getProfile(callback = null) {
		if (this.userId.length != 64) {
			callback(false)
			return false
		}

		try {
			var { data, revision } = await this.skynetClient.db.getJSON(this.userId, 'profile')
		} catch (error) {
			var data = null
			var revision = null
		}
		
		if (callback != null) {
			callback(data, revision)
		}
	}
	
	/*

	Functions below are only for sky-id.hns.siasky.net ;)
	
	*/

	setAccount(appData) {
		if (appData == false) {
			this.seed = ''
		} else {
			for (var key in appData) {
				// skip loop if the property is from prototype
				if (!appData.hasOwnProperty(key)) continue
				this[key] = appData[key]
			}
		}
		toggleElementsDisplay(this.seed)
		return true
	}

	setMnemonic(mnemonic, callback, rememberMe = false, checkMnemonic = false) {
		let mnemonicBytes = sia.mnemonics.mnemonicToBytes(mnemonic)
		if (mnemonicBytes.length != 32) {
			console.log('Wrong mnemonic length:', mnemonicBytes.length)
			callback(false)
			return
		}

		let seed = toHexString(mnemonicBytes)
		setCookie({ "seed": seed }, rememberMe)

		if (checkMnemonic && this.setAccount({ "seed": seed })) {
			var self = this
			skyid.getJSON('profile', function (response, revision) {
				if (response == null) { // file not found
					self.sessionDestroy()
				    callback(false)
				} else {
				    callback(true, seed)
				}
			})
		} else {
		    callback(this.setAccount({ "seed": seed }), seed)
		}
	}

	generateNewMasterSeed() {
		if (this.seed != '') {
			throw "redeclaration of master seed. skyid.generateNewMasterSeed() called after skyid cookie was set already. If you want, you can skyid.sessionDestroy()"
		} else {
			let rendomData = sia.keyPair.generateRandomData()
			let mnemonic = sia.mnemonics.bytesToMnemonic(rendomData)
			return mnemonic
		}
	}

	makeLoginSuccessPayload(appId, referrer) {
		var appSeed = this.deriveChildSeed(appId)
		// generate private app data
		const masterKeys = genKeyPairFromSeed(this.seed)
		let appData = { 'seed': appSeed, 'userId': masterKeys.publicKey, 'url': document.referrer, 'appImg': null }

		// generate public app data
		const { publicKey, privateKey } = genKeyPairFromSeed(appSeed)
		let publicAppData = { 'url': referrer, 'publicKey': publicKey, 'img': null }
		let postMessage = { 'sender': 'skyid', 'eventCode': 'login_success', 'appData': appData }

		return { 'postMessage': postMessage, 'publicAppData': publicAppData }
	}
}
