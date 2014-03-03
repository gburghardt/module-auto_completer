Module.AutoCompleterModule = Module.Base.extend({

	prototype: {

		actions: {
			click: [
				"focusInput",
				"removeItem",
				"selectSuggestion"
			],
			keydown: [
				"handleKeyDown"
			],
			keypress: [
				"handleKeyPress"
			],
			keyup: [
				"search"
			]
		},

		charCodes: {
			BACKSPACE: 8,
			DELETE: 46,
			DOWN: 40,
			ENTER: 13,
			LEFT: 37,
			RIGHT: 39,
			TAB: 9,
			UP: 38
		},

		_delayTimer: null,

		elementStore: {
			elements: {
				destroyedItems: { selector: "ol.module-autoCompleter-destroyed-items" },
				firstSuggestion: { selector: "ol.module-autoCompleter-suggestions>li", nocache: true },
				input: { selector: ".module-autoCompleter-input" },
				itemList: { selector: "ol.module-autoCompleter-items" },
				itemTemplate: { selector: "script.module-autoCompleter-item-template" },
				suggestionList: { selector: "ol.module-autoCompleter-suggestions" },
				selectedSuggestion: { selector: "ol.module-autoCompleter-suggestions>li.selected", nocache: true }
			},
			collections: {
				suggestions: { selector: "ol.module-autoCompleter-suggestions>li", nocache: true }
			}
		},

		_hideTimer: null,

		options: {
			allowUnknownItems: true,
			confirmOnRemove: true,
			delay: 500,
			errorText: "An error occurred. Please try again.",
			hideOnRemove: false,
			minChars: 3,
			selectedClass: "selected",
			removeConfirmation: "Are you sure you want to remove this item?",
			removeOnBackspace: true,
			unknownItemClass: "unknown",
			searchMethod: "POST",
			searchParam: "query",
			searchURL: null
		},

		xhr: null,

		_ready: function _ready() {
			Module.Base.prototype._ready.call(this);

			this.elementStore.returnNative = true;
			this.handleBlur = this.handleBlur.bind(this);
			this.handleDocumentClick = this.handleDocumentClick.bind(this);

			if (this.element.addEventListener) {
				this.input().addEventListener("blur", this.handleBlur, false);
			}
			else {
				this.input().attachEvent("onblur", this.handleBlur);
			}
		},

		destructor: function destructor(keepElement) {
			if (this.element.removeEventListener) {
				this.input().removeEventListener("blur", this.handleBlur, false);
			}
			else {
				this.input().detachEvent("onblur", this.handleBlur);
			}

			if (this.xhr) {
				this.xhr.abort();
				this.xhr = null;
			}

			Module.prototype.destructor.call(this, keepElement);
		},

		_addSelectedSuggestion: function _addSelectedSuggestion(searchText) {

			var suggestion = this.selectedSuggestion();

			if (!suggestion && this.options.allowUnknownItems) {
				var data = {
					searchText: searchText,
					timestamp: new Date().getTime()
				};

				suggestion = this.document.createElement("li");
				suggestion.removeAttribute("data-action");
				suggestion.className = this.options.unknownItemClass;
				suggestion.innerHTML = this.itemTemplate().innerHTML
					.replace(/^\s+|\s+$/g, "")
					.replace(/#\{(\w+)\}/g, function(match, key) {
						return data[key] || "";
					});
			}
			else if (suggestion) {
				suggestion.parentNode.removeChild(suggestion);
				suggestion.classList.remove(this.options.selectedClass);
				suggestion.removeAttribute("data-action");
			}

			this._appendItem(suggestion);
			this.input().innerHTML = "";
		},

		_appendItem: function _appendItem(newItem) {
			if (this.notify("item.beforeAdd", { item: newItem })) {
				this.itemList().insertBefore(newItem, this.input());
				this.notify("item.afterAdd", { item: newItem })
			}
		},

		focus: function focus() {
			if (this._hideTimer) {
				clearTimeout(this._hideTimer);
			}

			this.input().focus();
			this.showSuggestions();
		},

		focusInput: function focusInput(event, element, params) {
			event.stop();
			this.focus();

			var range, selection, input = this.input();

			if (input !== event.target) {
				if (this.document.createRange) {
					range = this.document.createRange();
					range.selectNodeContents(this.input());
					range.collapse(false);
					selection = this.window.getSelection();
					selection.removeAllRanges();
					selection.addRange(range);
				}
				else if (this.document.selection) {
					range = this.document.body.createTextRange();
					range.moveToElementText(this.input());
					range.collapse(false);
					range.select();
				}
			}
		},

		getSearchText: function getSearchText() {
			return this.input().innerHTML.replace(/(^\s+|\s+$|<br>)/g, "");
		},

		handleBlur: function handleBlur(event) {
			var that = this;

			this._hideTimer = setTimeout(function() {
				that.hideSuggestions();
				that._hideTimer = null;
				that = null;
			}, 200);
		},

		handleDocumentClick: function handleDocumentClick(event) {
			this.hideSuggestions();
		},

		handleKeyDown: function handleKeyDown(event, element, params) {
			var code = event.keyCode || event.charCode,
			    searchText = this.getSearchText();

			if (this.options.removeOnBackspace && this.charCodes.BACKSPACE === code && /^(\s*)$/.test(searchText)) {
				event.stop();
				this._removeLastItem();
			}
			else if (this.charCodes.UP === code) {
				event.stop();
				this._selectPrevSuggestion();
			}
			else if (this.charCodes.DOWN === code) {
				event.stop();
				this._selectNextSuggestion();
			}
		},

		handleKeyPress: function handleKeyPress(event, element, params) {
			var code = event.keyCode || event.charCode,
			    searchText = this.getSearchText();

			if (this.charCodes.ENTER === code) {
				event.stop();
				this._addSelectedSuggestion(searchText);
			}
		},

		hideSuggestions: function hideSuggestions() {
			var list = this.suggestionList();

			if (list.style.display !== "none") {
				list.style.display = "none";
				this.notify("suggestions.hidden");
			}
		},

		_removeItem: function _removeItem(item) {
			if (this.notify("item.beforeRemove", { item: item })) {
				item.parentNode.removeChild(item);

				if (this.options.hideOnRemove) {
					var fields = this.elementStore.querySelectorAll("input[type=hidden]", item),
					    i = 0, length = fields.length,
					    regex = /_destroy\]$/;

					for (i; i < length; i++) {
						if (regex.test(fields[i].name)) {
							fields[i].value = 1;
							this.destroyedItems().appendChild(item);
							break;
						}
					}
				}

				this.notify("item.afterRemove", { item: item });
			}
		},

		removeItem: function removeItem(event, element, params) {
			event.stop();

			if (!this.options.confirmOnRemove || confirm(this.options.removeConfirmation)) {
				this._removeItem(element.parentNode);
				this.focus();
			}
		},

		_removeLastItem: function _removeLastItem() {
			var sibling = this.input().previousSibling;

			while (sibling && sibling.nodeName !== "LI") {
				sibling = sibling.previousSibling;
			}

			if (sibling) {
				this._removeItem(sibling);
			}
		},

		search: function search(event, element, params) {
			var code = event.keyCode || event.charCode,
			    searchText = this.getSearchText(),
			    charCodes = this.charCodes;

			if (code === charCodes.UP ||
				code === charCodes.DOWN ||
				code === charCodes.LEFT ||
				code === charCodes.RIGHT ||
				code === charCodes.BACKSPACE ||
				code === charCodes.DELETE ||
				code === charCodes.ENTER ||
				code === charCodes.TAB) {
				return;
			}
			else if (searchText.length >= this.options.minChars) {
				if (this._delayTimer) {
					clearTimeout(this._delayTimer);
				}

				var that = this;

				this._delayTimer = setTimeout(function() {
					that._search(searchText);
					that = event = element = params = null;
				}, this.options.delay);
			}
		},

		_search: function _search(searchText) {
			if (!this.options.searchURL) {
				throw new Error("Missing required option: searchURL");
			}

			var that = this,
			    xhr = this.xhr = new XMLHttpRequest(),
			    url = this.options.searchURL
			        + (/\?/.test(this.options.searchURL) ? "&" : "?")
			        + escape(this.options.searchParam)
			        + "=" + escape(searchText),
			    method = this.options.searchMethod.toUpperCase();

			xhr.onreadystatechange = function() {
				if (this.readyState !== 4) {
					return;
				}
				else if (this.status === 200) {
					that.suggestionList().innerHTML = this.responseText;
					that.notify("search.success", { text: searchText, xhr: xhr, url: url, method: method });
				}
				else {
					that.suggestionList().innerHTML = '<li class="error">' + that.options.errorText + '</li>';
					that.notify("search.error", { text: searchText, xhr: xhr, url: url, method: method });
				}

				that._loaded();
				that.notify("search.afterSendRequest", { text: searchText, xhr: xhr, url: url, method: method });
				xhr.onreadystatechange = xhr = that.xhr = that = null;
			};

			xhr.setRequestHeader("X-REQUESTED-WITH", "XMLHttpRequest");

			if (this.notify("search.beforeSendRequest", { text: searchText, xhr: xhr, url: url, method: method })) {
				this._loading();
				this.showSuggestions();
				xhr.open(method, url, true);
				xhr.send(null);
			}
		},

		_selectNextSuggestion: function _selectNextSuggestion() {
			var suggestion = this.selectedSuggestion();

			if (suggestion) {
				suggestion = suggestion.nextSibling;

				while (suggestion && suggestion.nodeName !== "LI") {
					suggestion = suggestion.nextSibling;
				}

				if (suggestion && suggestion.getAttribute("data-action")) {
					this.selectedSuggestion().classList.remove(this.options.selectedClass)
					suggestion.classList.add(this.options.selectedClass);
				}
			}
			else {
				suggestion = this.firstSuggestion();

				if (suggestion && suggestion.getAttribute("data-action")) {
					suggestion.classList.add(this.options.selectedClass);
				}
			}
		},

		_selectPrevSuggestion: function _selectPrevSuggestion() {
			var suggestion = this.selectedSuggestion();

			if (suggestion) {
				suggestion = suggestion.previousSibling;

				while (suggestion && suggestion.nodeName !== "LI") {
					suggestion = suggestion.previousSibling;
				}

				if (suggestion && suggestion.getAttribute("data-action")) {
					this.selectedSuggestion().classList.remove(this.options.selectedClass)
					suggestion.classList.add(this.options.selectedClass);
				}
			}
			else {
				var suggestions = this.suggestions(),
				    suggestion = suggestions[suggestions.length - 1];

				if (suggestion && suggestion.getAttribute("data-action")) {
					suggestions[suggestions.length - 1].classList.add(this.options.selectedClass);
				}
			}
		},

		selectSuggestion: function selectSuggestion(event, element, params) {
			event.stop();
			element.parentNode.removeChild(element);
			this._appendItem(element);
			this.focus();
		},

		showSuggestions: function showSuggestions() {
			var list = this.suggestionList();

			if (list.style.display === "none") {
				list.style.display = "block";
				this.notify("suggestions.shown");
			}
		}

	}

});
