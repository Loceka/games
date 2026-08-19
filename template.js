const data = {
	name: "data",
	saveData() {
		// \{\s+(\S+:\s*\S+,)\s+(\S+:\s*\S+)\s+\} => { $1 $2 }
		// \{\s*(\S+:\s*".*?")\s*\} => { $1 } ; ajouter virgule en fin et sort alpha ; (?<!^.{23})\{ =>  {
		this.removeTab();
		const data = Object.entries(this).reduce((s, [k, v]) => s + "\n\t" + (typeof v === "function" ? ((v.toString().match(/^\s*\w/) ? "" : k.replace(/^\S+\s+.+$/, '"$&"') + ": ") + v.toString()) : k.replace(/^\S+\s+.+$/, '"$&"') + ": " + JSON.stringify(v)) + ",", "const " + this.name + " = {") + "\n}";
		const file = new Blob([data], {type: "text/javascript"});
		const a = document.createElement("a"),
		url = URL.createObjectURL(file);
		a.href = url;
		a.download = this.name + ".js";
		document.body.appendChild(a);
		a.click();
		setTimeout(function() {
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		}, 0);
	},
	sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
	getPageDocument(url) {
		return new Promise((resolve, reject) => {
			if (location.href.startsWith(url)) {
				resolve(document);
			} else {
				const getDocument = html => {
					const page = document.implementation.createHTMLDocument();
					page.documentElement.innerHTML = html;
					if (!url.startsWith(location.origin)) {
						page.documentElement.querySelector("head").insertAdjacentHTML("afterbegin", "<base href='" + url + "'/>");
					}
					page.documentElement.location = new URL(url);
					resolve(page.documentElement);
				};

				const request = (typeof(GM_xmlhttpRequest) === "undefined")
					? () => fetch(url).then(r => r.text().then(getDocument)).catch(reject)
					: () => GM_xmlhttpRequest({ url: url, method: "GET", onload: r => getDocument(r.responseText), onerror: r => reject(r.responseText) });

				const wait = 500;
				window.setTimeout(request, wait);
			}
		});
	},
	async getPageTab(url) {
		this.tab = this.tab ?? window.open('', '_blank');
		return new Promise(async (resolve, reject) => {
			this.tab.location.href = url;
			const timeout = window.setTimeout(reject, 2000, "timeout");

			const onLoad = () => {
				window.clearTimeout(timeout);
				resolve(this.tab);
			};

			const wait = 500;
			window.setTimeout(() => {
				if (this.tab.document.readyState === 'complete') {
					onLoad();
				} else {
					this.tab.addEventListener('load', onLoad, { once: true });
				}
			}, wait);
		});
	},
	waitForElement(doc, selectorOrFunc) {
		const find = (typeof selectorOrFunc === "function") ? selectorOrFunc : d => d.querySelector(selectorOrFunc);
		return new Promise(resolve => {
			let observer;
			const process = () => {
				const element = find(doc);
				if (element) {
					observer.disconnect();
					resolve(element);
				}
			};

			observer = new MutationObserver(process);
			observer.observe(doc, {childList: true, subtree: true});
			process();
		});
	},
	removeTab() {
		if (this.tab) {
			if (!this.tab.closed) this.tab.close();
			delete this.tab;
		}
	},
	logSimpleProgression(msg, indent = 1, method = "log") { if (!this.simpleProgression) { this.simpleProgression = true; console[method]("Progression:"); }; console[method]("\n" + "\t".repeat(indent) + "- " + msg); },
	logProgression(method = "log") { if (this.progression) console[method]("Progression:\n\t- " + this.progression); },
	previousProgression() {
		this.logProgression();
		return this.progression ? this.progression + "\n\t- " : "";
	},
	setProgression(prev, cur) {
		if (!cur) {
			this.logProgression();
			delete this.progression;
			delete this.simpleProgression;
		} else {
			this.progression = prev + cur;
		}
		return this;
	},
	toBase64Url(url) {
		return fetch(url)
		.then(response => response.blob())
		.then(blob => new Promise((resolve, reject) => {
			const reader = new FileReader()
			reader.onloadend = () => resolve(reader.result)
			reader.onerror = reject
			reader.readAsDataURL(blob)
		}));
	},
	linkToUrl(a) {
		if (a && a.href) {
			return new URL(a.href, document.querySelector("a").ownerDocument?.location?.href).href;
		}
		return undefined;
	},
	xpathRes(xpathResult) {
		let res, singleAccessor, listAccessor;
		try {
			switch (xpathResult.resultType) {
				case XPathResult.NUMBER_TYPE: singleAccessor = "numberValue"; break;
				case XPathResult.STRING_TYPE: singleAccessor = "stringValue"; break;
				case XPathResult.BOOLEAN_TYPE: singleAccessor = "booleanValue"; break;
				case XPathResult.UNORDERED_NODE_ITERATOR_TYPE:
				case XPathResult.ORDERED_NODE_ITERATOR_TYPE:
					listAccessor = "iterateNext";
					break;
				case XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE:
				case XPathResult.ORDERED_NODE_SNAPSHOT_TYPE:
					listAccessor = "snapshotItem";
					break;
				case XPathResult.ANY_UNORDERED_NODE_TYPE:
				case XPathResult.FIRST_ORDERED_NODE_TYPE:
					singleAccessor = "singleNodeValue";
					break;
				default:
					console.error(`Error: Unknown result type ${res.resultType}.`);
					return res;
			}
			if (singleAccessor) {
				res = xpathResult[singleAccessor];
			} else {
				res = [];
				let i = 0, node;
				while (node = xpathResult[listAccessor](i++)) {
					res.push(node);
				}
			}
		} catch (e) {
			console.error(`Error: Document tree modified during iteration ${e}`);
		}
		return res;
	},
	fillAll() {
		const process = {
			"__hostname__": d => d.fillData(),
		};
		try {
			let res = process[window.location.hostname]?.(this);
			res = res ?? Object.values(process).reduce((prev, cur) => prev ? prev.then(cur) : cur(this), null);
			res.then(d => d.setProgression().saveData());
		} catch (e) {
			this.logProgression("error");
			console.error(e);
			throw e;
		}
	},
	async fillData() {
		return this;
	},
	data: {},
}
