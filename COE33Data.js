const COE33Data = {
	name: "COE33Data",
	saveData() {
		// \{\s+(\S+:\s*\S+,)\s+(\S+:\s*\S+)\s+\} => { $1 $2 }
		// \{\s*(\S+:\s*".*?")\s*\} => { $1 } ; ajouter virgule en fin et sort alpha ; (?<!^.{23})\{ =>  {
		const data = Object.entries(this).reduce((s, [k, v]) => s + "\n\t" + (typeof v === "function" ? v.toString() : k.replace(/^\S+\s+.+$/, '"$&"') + ": " + JSON.stringify(v)) + ",", "const " + this.name + " = {") + "\n}";
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
	logSimpleProgression(msg, method = "log") { if (!this.simpleProgression) { this.simpleProgression = true; console[method]("Progression:"); }; console[method]("\n\t- " + msg); },
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
			"expedition33.wiki.fextralife.com": d => d.fillMerchants(),
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
	async fillMerchants() {
		this.logSimpleProgression("Processing merchant list");

		const cont = await this.getPageDocument("https://expedition33.wiki.fextralife.com/Merchants");
		this.xpathRes(cont.evaluate('//div[h3[starts-with(text(), "All Merchants")]]//li', document)).forEach(e => {
				const nameElem = e.querySelector(".fextratip > a");
				const locationElem = e.querySelector(".fextratip + a");
				this.merchants[nameElem.textContent] = {
					url: this.linkToUrl(nameElem),
					location: locationElem?.textContent || e.textContent.trim().replace(/^.+?\(([^()]+)\)$|^.*$/s, "$1") || "Continent",
				};
			});

		for (const merchant of Object.entries(this.merchants)) {
			this.logSimpleProgression("Processing merchant " + merchant[0]);
			await this.fillMerchant(merchant[1]);
		}

		return this;
	},
	async fillMerchant(merchant) {
		const cont = await this.getPageDocument(merchant.url);

		const locationInfos = [...cont.querySelector("h3 + ul")?.querySelectorAll("li")];
		merchant.locationInfo = "";
		locationInfos.forEach(e => {
				const text = e.textContent.trim();
				if (text.toLowerCase().startsWith("initial location")) {
					merchant.locationUrl = this.linkToUrl(e.querySelector("a"));
				} else {
					if (text.toLowerCase().startsWith("location")) {
						merchant.locationUrl = this.linkToUrl([...e.querySelectorAll("a")].find(a => a.textContent.match(/^(?!.*\b(Flag|Map)\b)/i)));
					}
					merchant.locationInfo = (merchant.locationInfo ? merchant.locationInfo + "\n" : "" ) + text.replace(/^Location\s*:\s*|\s*\[(?=[^\]]+\bMap\b).+?\]/gi, "");
					merchant.mapUrl = this.linkToUrl([...e.querySelectorAll("a")].find(a => a.textContent.match(/\bMap\b/i)))
				}
			});

		const itemTitleElem = [...cont.querySelectorAll("h3")].find(h3 => h3.textContent.match(/\bMerchant\s+Inventory\b/i));
		let itemCont = itemTitleElem, items = [];
		while (!items.length && (itemCont = itemCont.nextElementSibling).nodeName.toLowerCase() !== 'h3') {
			items = [...itemCont.querySelectorAll("table tr")].filter(tr => !tr.querySelector("td:first-child").textContent.match(/item\b/i));
		}
		merchant.items = {};
		items.forEach(e => {
			merchant.items[e.querySelector("td:first-child").textContent] = e.querySelector("td:last-child").textContent.replace(/\D/g, "");
		});
	},
	merchants: {"Alexcyclo":{"url":"https://expedition33.wiki.fextralife.com/Alexcyclo","location":"Gestral Village","locationInfo":"When you reach the Gestral Village, look for the Chef House. From there, head to your right and look for the middle entrance. That entrance will lead you to the exact location of Alexcyclo.","locationUrl":"https://expedition33.wiki.fextralife.com/Gestral+Village","items":{"Sakapatate Outfit (Sciel)":"1000"}},"Anthonypo":{"url":"https://expedition33.wiki.fextralife.com/Anthonypo","location":"Endless Night Sanctuary","locationInfo":"Endless Night Sanctuary\nFrom the Night Totem Expedition Flag, take the rope towards the left of the giant totem in the open area, then head right and take the rope at the end of the path. Anthonypo will be on the next level up.","locationUrl":"https://expedition33.wiki.fextralife.com/Endless+Night+Sanctuary","items":{"Critical Burn (Lvl. 25): Fight the Merchant":"116725","Marking Break (Lvl. 25): Fight the Merchant":"80040","Shell On Rush (Lvl. 25): Fight the Merchant":"100050","Guleson (Fight the Merchant)":"64699","Chroma Catalyst (x20)":"500","Polished Chroma Catalyst (x15)":"1000","Resplendent Chroma Catalyst (x10)":"3000","Grandiose Chroma Catalyst (x5)":"6000","Powerful Heal (Lvl. 25)":"80040","Powerful Shield (Lvl. 25)":"80040","Protecting Attack (Lvl. 25)":"100050","Charging Mark (Lvl. 25)":"100050","Accelerating Tint (Lvl. 25)":"80040","Versatile (Lvl. 25)":"80040"}},"Blooraga":{"url":"https://expedition33.wiki.fextralife.com/Blooraga","location":"The Visages","locationInfo":"Visages, found in the middle near the Plazza Expedition Flag as the path forks into different directions","locationUrl":"https://expedition33.wiki.fextralife.com/Visages","items":{"Sadon (Level 11): can be purchased after defeating Blooraga":"12800","Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Resplendent Chroma Catalyst":"3000","Colour of Lumina":"1000","Recoat":"10000","Healing Share (Level 11)":"19200"}},"Bruler and Cruler":{"url":"https://expedition33.wiki.fextralife.com/Bruler+and+Cruler","location":"Coastal Cave","locationInfo":"Bruler and Cruler can be found at the Coastal Cave's Entrance Expedition Flag. Once you enter Coastal Cave, just go straight ahead, and you will find Bruler and Cruler. Before you can open the merchants' wares, you will have to fight them first.","locationUrl":"https://expedition33.wiki.fextralife.com/Coastal+Cave","items":{"Lanceram":"21275","Lighterim":"15725","Seeram":"21275","Brulerum":"15725","Cruleram":"19795","Deminerim":"15725","Gobluson":"19240","Bourgelon":"17760"}},"Cribappa":{"url":"https://expedition33.wiki.fextralife.com/Cribappa","location":"Lumiere Act III","locationInfo":"Lumiere (Act III), found along the path from the Opera House Expedition Flag and Lumiere's Garden (fastest to backtrack from Lumiere's Garden)","locationUrl":"https://expedition33.wiki.fextralife.com/Lumiere","items":{"Full Strength (Level 16)":"53200","Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Resplendent Chroma Catalyst":"3000","Colour of Lumina":"1000","Recoat":"10000","Potierim (Level 16)":"27360","Volesterum (Level 16)":"31008","Ballaro (Level 16)":"28880","Gaulteram (Level 16)":"30704","Sadon (Level 16)":"24320"}},"Delsitra":{"url":"https://expedition33.wiki.fextralife.com/Delsitra","location":"Gestral Village","locationInfo":"Gestral Village, can be found in the area on the left of the chief's house.","locationUrl":"https://expedition33.wiki.fextralife.com/Gestral+Village","items":{"Sakapatate Outfit (Verso)":"1000","Sakapatate Outfit (Gustave)":"1000","Gestral Haircut (Gustave)":"1000"}},"Eesda":{"url":"https://expedition33.wiki.fextralife.com/Eesda","location":"Gestral Village","locationInfo":"Does this NPC Move: No","locationUrl":"https://expedition33.wiki.fextralife.com/Gestral+Village","items":{"Sekarum (Level 5)":"4830","Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Colour of Lumina":"1000","Recoat":"10000","Healing Mark (Level 5)":"9200"}},"Eragol":{"url":"https://expedition33.wiki.fextralife.com/Eragol","location":"The Reacher - Foggy Area","locationInfo":"The Reacher, Foggy Area - After teleporting to the Foggy Area Rest Point, head down the ramps and hug the left side of the area until you reach a light rope. Head down the light rope and you will find the Gestral Merchant standing at the cliff’s edge.","locationUrl":"https://expedition33.wiki.fextralife.com/The+Reacher","items":{"Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Resplendent Chroma Catalyst":"3000","Recoat":"10000","Anti-Blight":"67350","Exposing Break":"53880","Charging Weakness":"53880","Tainted":"49391","Protecting Heal":"53880"}},"Fusoka":{"url":"https://expedition33.wiki.fextralife.com/Fusoka","location":"Flying Manor","locationInfo":"Flying Manor, past the Bourgeon boss at the path accessed from a lift in the Central Plaza","locationUrl":"https://expedition33.wiki.fextralife.com/Flying+Manor","items":{"Stay Marked (Level 28): can be purchased after defeating Fusoka in a duel":"122250","Accelerating Shots (Level 28): can be purchased after defeating Fusoka in a duel":"89650","Empowering Parry (Level 28): can be purchased after defeating Fusoka in a duel":"97800","Gradient Breaker (Level 28): can be purchased after defeating Fusoka in a duel":"97800","Longer Burn (Level 28): can be purchased after defeating Fusoka in a duel":"142625","Break Specialist (Level 28): can be purchased after defeating Fusoka in a duel":"81500","Slowing Break (Level 28): can be purchased after defeating Fusoka in a duel":"97800","Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Resplendent Chroma Catalyst":"3000","Grandiose Chroma Catalyst":"6000","Colour of Lumina":"1000","Recoat":"10000","Martenon (Level 28)":"97800","Sidaro (Level 28)":"76610","Seashellum (Level 28)":"75795","Elerim (Level 28)":"89650","Gesam (Level 28)":"81500"}},"Gestral Merchant (Sacred River)":{"url":"https://expedition33.wiki.fextralife.com/Gestral+Merchant+(Sacred+River)","location":"Continent","locationInfo":"When you reach the Sacred River, follow the path of the bells that hang from above, and it will lead you to the location of the Gestral Merchant. Also, you need to fight the Gestral Merchant before you can view the Pictos that it sells from its wares.","locationUrl":"https://expedition33.wiki.fextralife.com/Sacred+River","items":{"Energising Parry":"78575","Solidifying":"67350","Double Burn":"89800","Rewarding Mark":"53880","Stun Boost":"67350","Shield Affinity":"75575","Glass Canon":"67350","Empowering Attack":"67350","Revive Tint Energy":"67350","Burning Shots":"49391","Critical Stun":"53880","Energising Turn":"89800"}},"Gestral Merchant":{"url":"https://expedition33.wiki.fextralife.com/Gestral+Merchant","location":"Root of All Evil","locationInfo":"The Gestral Merchant is found near the Main Field Expedition Flag.","locationUrl":"https://expedition33.wiki.fextralife.com/Root+of+All+Evil","items":{"Osquio Outfit (Maelle)":"20000","Osquio Outfit (Lune)":"20000","Osquio Outfit (Sciel)":"20000","Osquio Outfit (Monoco)":"20000","Osquio Haircut (Maelle)":"5000","Osquio Haircut (Lune)":"5000","Osquio Haircut (Sciel)":"5000","Osquio Haircut (Monoco)":"5000"}},"Grandis":{"url":"https://expedition33.wiki.fextralife.com/Grandis","location":"Monoco's Station","locationInfo":"Grandis is just on the left side of the Monoco's Station Expedition Flag.","locationUrl":"https://expedition33.wiki.fextralife.com/Monoco's+Station","items":{"Survivor":"98000","Energising Death":"58800","Greater Rush":"85750","Burning Shots":"53901","Grandaro":"53901","Cultam":"47530","Coldum":"39200","Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Colour of Lumina":"1000","Recoat":"10000"}},"Grour":{"url":"https://expedition33.wiki.fextralife.com/Grour","location":"Renoir's Drafts","locationInfo":"Renoir's Drafts. Backtrack down the ramp from the Golden Tree Expedition Flag and you will see another small ramp leading up toward a tilted building. Climb the small ramp and use grapple at the top to scale the building and find Grour on the roof.","locationUrl":"https://expedition33.wiki.fextralife.com/Renoir's+Drafts","items":{"Energising Turn":"195400","Energising Attack I":"146550","Energising Parry":"170975","Augmented First Strike":"117240","Aegis Revival":"117240","Augmented Counter I":"122125","Solo Fighter":"97700","Sweet Kill":"107471","Painerim":"83045","Nosaram":"107471","Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Resplendent Chroma Catalyst":"3000","Grandiose Chroma Catalyst":"6000","Colour of Lumina":"1000","Recoat":"10000","Yeverum":"101608","Chromaro":"102585","Charnon":"89884"}},"Jerijeri":{"url":"https://expedition33.wiki.fextralife.com/Jerijeri","location":"Stone Wave Cliffs - Old Farm","locationInfo":"Does this NPC Move: No","locationUrl":"https://expedition33.wiki.fextralife.com/Stone+Wave+Cliffs","items":{"Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Colour of Lumina":"1000","Recoat":"10000","Ponytail Haircut (Sciel)":"1000"}},"Jujubree":{"url":"https://expedition33.wiki.fextralife.com/Jujubree","location":"Gestral Village","locationInfo":"Does this NPC Move: No","locationUrl":"https://expedition33.wiki.fextralife.com/Gestral+Village","items":{"Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Colour of Lumina":"1000","Lumina":"10000","Critical Moment (Level 5)":"5520"}},"Kasumi":{"url":"https://expedition33.wiki.fextralife.com/Kasumi","location":"Forgotten Battlefield","locationInfo":"Clair Obscur Expedition 33 Kasumi NPC notes, tips, lore details, and more go here.","items":{"Obscur Outfit (Maelle): can be purchased after challenging Kasumi to a fight and winning":"5000","Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Colour of Lumina":"1000","Recoat":"10000","Inverted Affinity (Level 8)":"9870","Benisim (Level 8)":"7990"}},"Klaudiso":{"url":"https://expedition33.wiki.fextralife.com/Klaudiso","location":"Sirene","locationInfo":"Sirene","items":{"Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Resplendent Chroma Catalyst":"3000","Colour of Lumina":"1000","Recoat":"10000","Double Mark":"42400","Energising Attack II":"37100","Greater Powerful":"37100"}},"Mandelgo":{"url":"https://expedition33.wiki.fextralife.com/Mandelgo","location":"Old Lumiere","locationInfo":"Old Lumiere","items":{"Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Longer Powerful":"204000","Colour of Lumina":"1000","Recoat":"10000","Healing Counter":"20400","Revive Tint Shard":"1000"}},"Melosh":{"url":"https://expedition33.wiki.fextralife.com/Melosh","location":"The Monolith","locationInfo":"The Monolith","items":{"Garganon":"26384","Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Resplendent Chroma Catalyst":"3000","Colour of Lumina":"1000","Recoat":"10000","Healing Tint Shard":"5000"}},"Mistra":{"url":"https://expedition33.wiki.fextralife.com/Mistra","location":"The Monolith","locationInfo":"The Monolith","items":{"Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Resplendent Chroma Catalyst":"3000","Colour of Lumina":"1000","Recoat":"10000","Fragaro":"35360","Veremum":"27744"}},"Najabla":{"url":"https://expedition33.wiki.fextralife.com/Najabla","location":"Verso's Drafts","locationInfo":"You can find Najabla near the Reverie Path Expedition Flag.","locationUrl":"https://expedition33.wiki.fextralife.com/Verso's+Drafts","items":{"Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Resplendent Chroma Catalyst":"3000","Grandiose Chroma Catalyst":"6000","AP Discount (Level 29)":"217000","Consuming Attack (Level 29)":"130200","Bonbim":"102424","Colour of Lumina":"1000","Recoat":"10000","Esquie Haircut (Verso)":"5000","Esquie Haircut (Maelle)":"5000","Esquie Haircut (Lune)":"5000","Esquie Haircut (Sciel)":"5000","Esquie Haircut (Monoco)":"5000"}},"Noco":{"url":"https://expedition33.wiki.fextralife.com/Noco","location":"Flying Waters","locationInfo":"Does this NPC Move: Yes.","locationUrl":"https://expedition33.wiki.fextralife.com/Flying+Waters","items":{"Exposing Attack (Level 3): Must defeat Noco in a fight":"3500","Chroma Catalyst":"500","Colour of Lumina":"1000"}},"Persik":{"url":"https://expedition33.wiki.fextralife.com/Persik","location":"Falling Leaves - Resinveil","locationInfo":"Falling Leaves\nFrom the first flag, proceed beyond the arch and go left. Use the grapple point and continue along the path to find Persik","locationUrl":"https://expedition33.wiki.fextralife.com/Falling+Leaves","items":{"Direton (Challenge Persik to a duel to unlock)":"30125","Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Resplendent Chroma Catalyst":"3000","Colour of Lumina":"1000","Recoat":"10000","Beneficial Contamination":"48200"}},"Pinabby":{"url":"https://expedition33.wiki.fextralife.com/Pinabby","location":"Yellow Harvest","locationInfo":"Yellow Harvest\nFrom the Harvester's Hollow Expedition Flag, make your way down the path towards the statue in the lake, go right, past the Jar enemy and up the big slope. You'll come to a circular area surrounded by lit lamps, with two Nevron corpses in the middle. Go ahead between the two corpses, and straight ahead of you will be a floating rock platform with a grapple point. Grapple up to the platform to find Pinabby.","locationUrl":"https://expedition33.wiki.fextralife.com/Yellow+Harvest","items":{"Teamwork":"9120","Chroma Catalyst":"500","Polished Chroma Catalyst":"1000","Colour of Lumina":"1000","Recoat":"10000","Auto Death":"5320","Wavy Haircut (Lune)":"1000"}},"Verogo":{"url":"https://expedition33.wiki.fextralife.com/Verogo","location":"Frozen Hearts","locationInfo":"Frozen Hearts\nFrom the Iced Heart Expedition Flag, go straight up the train carts and grapple 3 times to reach a forked path. Drop towards the grapple point on the left to reach Verogo.","locationUrl":"https://expedition33.wiki.fextralife.com/Frozen+Hearts","items":{"Perelin Outfit (Verso)":"20000","Danseuse Outfit (Sciel)":"10000"}},"Appla":{"url":"https://expedition33.wiki.fextralife.com/Appla","location":"Continent","locationInfo":"Stone Wave Cliffs Cave","locationUrl":"https://expedition33.wiki.fextralife.com/Stone+Wave+Cliffs+Cave","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=103&code=mapA","items":{"Braid Haircut (Lune)":"1000","Short Curly Haircut (Sciel)":"1000"}},"Blabary":{"url":"https://expedition33.wiki.fextralife.com/Blabary","location":"Continent","locationInfo":"Southeast from the Hidden Gestral Arena","locationUrl":"https://expedition33.wiki.fextralife.com/Hidden+Gestral+Arena","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=9&code=mapA","items":{"Artist Haircut (Sciel)":"3000","Artist Haircut (Maelle)":"3000","Artist Haircut (Lune)":"3000","Goblu (Music Record)":"1000"}},"Blackora":{"url":"https://expedition33.wiki.fextralife.com/Blackora","location":"Continent","locationInfo":"Northwest from The Flying Manor","locationUrl":"https://expedition33.wiki.fextralife.com/Flying+Manor","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=161&code=mapA","items":{"Bun Haircut (Verso)":"3000","Ponytail Haircut (Lune)":"3000"}},"Carnovi":{"url":"https://expedition33.wiki.fextralife.com/Carnovi","location":"Continent","locationInfo":"Northwestern part of the map near Gestral Beach","locationUrl":"https://expedition33.wiki.fextralife.com/Gestral+Beach","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=150&code=mapA","items":{"Skirt Outfit (Sciel)":"5000"}},"Carrabi":{"url":"https://expedition33.wiki.fextralife.com/Carrabi","location":"Continent","locationInfo":"North of Esquie's Nest","locationUrl":"https://expedition33.wiki.fextralife.com/Esquie's+Nest","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=3&code=mapA","items":{"Lumiere Suit Outfit (Gustave)":"1000","Lumiere Outfit (Maelle)":"1000","Short Haircut (Gustave)":"500"}},"Citrelo":{"url":"https://expedition33.wiki.fextralife.com/Citrelo","location":"Continent","locationInfo":"Sacred River","locationUrl":"https://expedition33.wiki.fextralife.com/Sacred+River","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=249&code=mapA","items":{"Children of Lumiere":"1000"}},"Colaro":{"url":"https://expedition33.wiki.fextralife.com/Colaro","location":"Continent","locationInfo":"Stone Wave Cliffs","locationUrl":"https://expedition33.wiki.fextralife.com/Stone+Wave+Cliffs","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=216&code=mapA","items":{"Vintage Haircut (Sciel)":"2000","Double Braid Haircut (Maelle)":"2000"}},"Geranjo":{"url":"https://expedition33.wiki.fextralife.com/Geranjo","location":"Continent","locationInfo":"Located on an isolated island with one of the Manor entrances which is Northeast of the Endless Tower.","locationUrl":"https://expedition33.wiki.fextralife.com/The+Manor","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=91&code=mapA","items":{"Skirt Outfit (Lune)":"1000","Vintage Haircut (Maelle)":"1000","Civilian Outfit (Maelle)":"1000"}},"Granasori":{"url":"https://expedition33.wiki.fextralife.com/Granasori","location":"Continent","locationInfo":"South from The Monolith","locationUrl":"https://expedition33.wiki.fextralife.com/The+Monolith","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=186&code=mapA","items":{"Pure Outfit (Verso)":"10000","Double Braid Haircut (Lune)":"3000"}},"Jumeliba":{"url":"https://expedition33.wiki.fextralife.com/Jumeliba","location":"Continent","locationInfo":"Northeast of the Yellow Harvest","locationUrl":"https://expedition33.wiki.fextralife.com/Yellow+Harvest","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=40&code=mapA","items":{"Charming Haircut (Gustave)":"500","Curly Haircut (Gustave)":"500"}},"Lucaroparfe":{"url":"https://expedition33.wiki.fextralife.com/Lucaroparfe","location":"Continent","locationInfo":"Southeast of The Manor entrance which is on the Southeast corner of the map.","locationUrl":"https://expedition33.wiki.fextralife.com/The+Manor","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=284&code=mapA","items":{"Pure Outfit (Monoco)":"10000","Pure Haircut (Monoco)":"2000"}},"Papasso":{"url":"https://expedition33.wiki.fextralife.com/Papasso","location":"Continent","locationInfo":"Across the island from the Floating Cemetery","locationUrl":"https://expedition33.wiki.fextralife.com/Floating+Cemetery","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=226&code=mapA","items":{"Messy Bun Haircut (Maelle)":"3000","Messy Bun Haircut (Lune)":"3000","Short Haircut (Sciel)":"3000","Gustave's Haircut (Verso)":"3000"}},"Pearo":{"url":"https://expedition33.wiki.fextralife.com/Pearo","location":"Continent","locationInfo":"Sirene's Dress","locationUrl":"https://expedition33.wiki.fextralife.com/Sirene's+Dress","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=271&code=mapA","items":{"Sirene Outfit (Sciel)":"5000"}},"Pecha":{"url":"https://expedition33.wiki.fextralife.com/Pecha","location":"Continent","locationInfo":"Can be found near the Painting Workshop, which at the northern part of the Map.","locationUrl":"https://expedition33.wiki.fextralife.com/Painting+Workshop","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=261&code=mapA","items":{"Plunging Bob Haircut (Sciel)":"2000","French Bob Haircut (Sciel)":"3000"}},"Rederi":{"url":"https://expedition33.wiki.fextralife.com/Rederi","location":"Continent","locationInfo":"An isolated Island West from Sunless Cliffs","locationUrl":"https://expedition33.wiki.fextralife.com/Sunless+Cliffs","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=189&code=mapA","items":{"Rebellious Haircut (Sciel)":"2000","Half Ponytail Haircut (Lune)":"2000","Robe de Jour":"1000"}},"Rubiju":{"url":"https://expedition33.wiki.fextralife.com/Rubiju","location":"Continent","locationInfo":"Isle of the Eyes","locationUrl":"https://expedition33.wiki.fextralife.com/Isle+of+the+Eyes","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=299&code=mapA","items":{"Simple Outfit (Verso)":"5000","Linen and Cotton":"1000"}},"Sodasso":{"url":"https://expedition33.wiki.fextralife.com/Sodasso","location":"Continent","locationInfo":"Northeast from The Reacher","locationUrl":"https://expedition33.wiki.fextralife.com/The+Reacher","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=273&code=mapA","items":{"Curly Haircut (Verso)":"2000","Short White Haircut (Maelle)":"2000","Double Braid Haircut (Sciel)":"2000"}},"Strabami":{"url":"https://expedition33.wiki.fextralife.com/Strabami","location":"Continent","locationInfo":"North of the Forgotten Battlefield","locationUrl":"https://expedition33.wiki.fextralife.com/Forgotten+Battlefield","mapUrl":"https://expedition33.wiki.fextralife.com/Interactive+Map?id=264&code=mapA","items":{"French Bob Haircut (Lune)":"3000","Lost Voice":"1000"}}},
}
