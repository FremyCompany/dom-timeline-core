// ==================================================
// DOM Timeline core (MIT Licensed)
// https://github.com/FremyCompany/dom-timeline-core
// ==================================================

// 
// if you didn't specify domTimelineOptions before this line, 
// those options will be use as the default options
// 
var domTimelineOptions = domTimelineOptions || {
	
	// ------------------------------------------------------------------------------------------------------------------
	// if true, the script will try to attribute changes to javascript stack traces
	// ------------------------------------------------------------------------------------------------------------------
	// note: this incurs an important dom performance impact on the page
	// ------------------------------------------------------------------------------------------------------------------
	// note: when this script is not run first on this page, this feature may not work completely
	//       to make sure it is run first, put a breakpoint before the first script of the page, 
	//       and execute it in the console before continuing the page execution
	// ------------------------------------------------------------------------------------------------------------------
	enableCallstackTracking: true,
	
	// ------------------------------------------------------------------------------------------------------------------
	// this function is called whenever (claimed or unclaimed) change records are being added to the dom history
	// its primary purpose is to allow you to log these events (in whole or after applying some filter)
	// ------------------------------------------------------------------------------------------------------------------
	considerLoggingRecords(claim,records,stack) {
		console.groupCollapsed(claim+" ["+records.length+"]");{
			for(let record of records) { console.log(record); }
			console.log(stack);
			console.groupEnd();
		};
	},
	
	// ------------------------------------------------------------------------------------------------------------------
	// this function is being called inline when a change record is being discovered
	// its primary usage is to allow you to break into the debugger in the context of the change
	// ------------------------------------------------------------------------------------------------------------------
	// note: this feature requires 'enableCallstackTracking' on and working (otherwise some changes will be unclaimed)
	// ------------------------------------------------------------------------------------------------------------------
	considerDomBreakpoint(m) {
		//if(m.attributeName=='style' && m.target.id=='configStackPage_1' && m.newValue && m.newValue.indexOf('block')>=0) {
		//	debugger;
		//}
	}
	
};

// 
// from there, you can find the actual dom-timeline-core code
// 
void function() {
	"use strict";
	
	// prepare to store the mutations
	var domHistoryPast = [];
	var domHistoryFuture = [];
	var domHistory = window.domHistory = {
		
		// ------------------------------------------------------------------------------------------------------------------
		// this MutationRecord array contains past dom changes of the page, ready to undo
		// ------------------------------------------------------------------------------------------------------------------
		past: domHistoryPast,
		
		// ------------------------------------------------------------------------------------------------------------------
		// this MutationRecord array contains undoed dom changes of the page, ready to redo
		// ------------------------------------------------------------------------------------------------------------------
		// note: if this array is not empty, the page will be frozen to avoid rewriting the history
		// ------------------------------------------------------------------------------------------------------------------
		future: domHistoryFuture,
		
		// ------------------------------------------------------------------------------------------------------------------
		// this MutationRecord array contains dom changes that were canceled just after execution, due to a future already existing
		// ------------------------------------------------------------------------------------------------------------------
		lostFuture: [],
		
		// ------------------------------------------------------------------------------------------------------------------
		// takes the last dom change added to the past history, undoes it, and add it to the future history
		// ------------------------------------------------------------------------------------------------------------------
		// note: this will lock the page in past history, potentially breaking page scripts
		// ------------------------------------------------------------------------------------------------------------------
		undo() {
			
			// clean records
			logUnclaimedMutations(o.takeRecords());
			
			// get mutation to undo
			var mutation = domHistoryPast.pop();
			if(!mutation) return;
			
			// undo it
			try {
				isDoingOffRecordsMutations++;
				domHistoryFuture.push(mutation);
				undoMutationRecord(mutation);
			} finally {
				isDoingOffRecordsMutations--;
				o.takeRecords();
			}
			
		},
		
		// ------------------------------------------------------------------------------------------------------------------
		// takes the last dom change added to the future history, redoes it, and add it to the past history
		// ------------------------------------------------------------------------------------------------------------------
		// note: this could unlock the page future history, if this was the last future change to apply
		// ------------------------------------------------------------------------------------------------------------------
		redo() {
			
			// clean records
			logUnclaimedMutations(o.takeRecords());
			
			// get mutation to undo
			var mutation = domHistoryFuture.pop();
			if(!mutation) return;
			
			// undo it
			try {
				isDoingOffRecordsMutations++;
				domHistoryPast.push(mutation);
				redoMutationRecord(mutation);
			} finally {
				isDoingOffRecordsMutations--;
				o.takeRecords();
			}
			
		}
		
	};
	
	// create an observer
	let o = new MutationObserver(logUnclaimedMutations);
	
	// allow things to be off-records
	let isDoingOffRecordsMutations = +false;
	function getAttribute(target, attributeName) {
		try {
			isDoingOffRecordsMutations++;
			return target.getAttribute(attributeName);
		} finally {
			isDoingOffRecordsMutations--;
		}
	}

	// hook the observer
	o.observe(
		document.documentElement, 
		{ 
			childList: true, 
			attributes: true, 
			characterData: true, 
			subtree: true, 
			attributeOldValue: true, 
			characterDataOldValue: true 
		}
	);
	
	// enable callstack tracking
	if(domTimelineOptions.enableCallstackTracking) {
		console.groupCollapsed("domTimelineOptions.enableCallstackTracking==true");
		try {
			enableCallstackTracking();
		} finally {
			console.groupEnd();
		}
	}
	
	// notify everything went fine
	console.log("setup completed without error"); return;
	//-----------------------------------------------------------------------------------------------------
	
	//
	// save the newValue attribute on records to enable redo, and add them to history
	//
	function postProcessRecords(records,stack) {
		
		// we cancel immediately any mutation which would be added to the past history when there is already a future
		if(domHistoryFuture.length > 0) {
			
			if(domHistory.lostFuture.length == 0) {
				console.warn("DOM Mutations were canceled because we are reviewing the past and there is already a future (see domHistory.lostFuture)");
				domHistory.lostFuture.push.apply(domHistory.lostFuture, records);
			} else {
				domHistory.lostFuture.push.apply(domHistory.lostFuture, records);
			}
			
			try {
				isDoingOffRecordsMutations++;
				for(var i = records.length; i--;) {
					undoMutationRecord(records[i])
				}
			} finally {
				isDoingOffRecordsMutations--;
				records.length = 0;
				o.takeRecords();
			}
			return;
			
		}
		
		// otherwise, we post process the records
		if(records.length == 1) {
			
			var record = records[0];
			if(record.type == 'attributes') {
				
				var target = record.target;
				var attrName = record.attributeName;
				record.newValue = getAttribute(target,attrName);
				
			} else if(record.type == 'characterData') {
				
				var target = record.target;
				record.newValue = target.nodeValue;
				
			}
			
			domHistoryPast.push(record);
			
			record.stack = stack;
			domTimelineOptions.considerDomBreakpoint(record);
			
		} else {
		
			var latestAttributeValues = new Map();
			var latestCharacterDataValues = new Map();
			for(var i = records.length; i--;) {
				
				var record = records[i];
				if(record.type == 'attributes') {
					
					var target = record.target;
					var attrName = record.attributeName;
					var attrValues = latestAttributeValues.get(target);
					if(!attrValues) latestAttributeValues.set(target, attrValues={});
					record.newValue = attrValues[attrName] || getAttribute(target,attrName);
					attrValues[attrName] = record.oldValue;
					
				} else if(record.type == 'characterData') {
					
					var target = record.target;
					var newValue = latestCharacterDataValues.get(target);
					record.newValue = (newValue != undefined) ? (newValue) : (target.nodeValue);
					latestCharacterDataValues.set(target, record.oldValue);
					
				}
				
				record.stack = stack;
				domTimelineOptions.considerDomBreakpoint(record);
				
			}
			domHistoryPast.push.apply(domHistoryPast, records);
		}
	}
	
	// 
	// log mutations which are not claimed by a monitored function call
	// 
	function logUnclaimedMutations(inputRecords) {
		var stack = undefined;
		var records = inputRecords || o.takeRecords(); 
		if(records && records.length) {
			
			postProcessRecords(records,stack);
			if(records.length) {
				domTimelineOptions.considerLoggingRecords("unclaimed",records,stack);
			}
			
		}
	}
	
	// 
	// log mutations which are claimed by a monitored function call
	// 
	function logClaimedMutations(claim, stack) {
		var records = o.takeRecords();
		if(records && records.length) {
			
			postProcessRecords(records,stack);
			if(records.length) {
				domTimelineOptions.considerLoggingRecords(claim,records,stack);
			}
			
		}
	}

	// 
	// enable callstack support
	// 
	function enableCallstackTracking() {
		
		// before hooking anything, get an instance of important classes
		var classListInstance = document.documentElement.classList;
		var styleInstance = document.documentElement.style;
		
		// the style object is special in some browsers, we need special attention to it
		if("style" in window.Element.prototype) wrapStyleInProxy(window.Element);
		if("style" in window.SVGElement.prototype) wrapStyleInProxy(window.SVGElement);
		if("style" in window.HTMLElement.prototype) wrapStyleInProxy(window.HTMLElement);
		
		// otherwhise, we can hook most properties and functions from those classes
		for(let protoName of ['SVGElement','HTMLElement','Element','Node','Range','Selection',classListInstance,styleInstance]) {
			try{
				let proto = (typeof(protoName) == 'string') ? (window[protoName].prototype) : Object.getPrototypeOf(protoName);
				protoName = (typeof(protoName) == 'string') ? protoName : Object.prototype.toString.call(protoName).replace(/\[object (.*)\]/,'$1');
				
				// for each property, we might want to setup a hook
				for(let propName of Object.getOwnPropertyNames(proto)) {
					if(/^on/.test(propName)) { continue/* and don't mess with events */; }
					
					let prop = Object.getOwnPropertyDescriptor(proto, propName);
					if("value" in prop) { 
						if(typeof(prop.value) == 'function') {
							
							console.log(`patching ${protoName}.prototype.${propName} as a function`);
							try {
							
								proto[propName] = function() {
									isDoingOffRecordsMutations || logUnclaimedMutations();
									let result = prop.value.apply(this, arguments);
									isDoingOffRecordsMutations || logClaimedMutations("set "+propName, new Error().stack.replace(/^Error *\r?\n/i,''));
									return result;
								};
								
							} catch (ex) {
								console.log(ex);
							}
							
						} else {
							console.log(`skipping ${protoName}..${propName} as a constant`);
						}
					} else { 
					
						console.log(`patching ${protoName}..${propName} as a property`);
						try {
							
							if(!prop.get || !/native code/.test(prop.get)) { continue; }
							Object.defineProperty(proto, propName, { 
								get() {
									try {
										let result = prop.get.apply(this,arguments);
										return result;
									} catch (ex) {
										if(ex.stack.indexOf("Illegal invocation")==-1) {
											throw ex;
										} else {
											console.log(ex);
										}
									}
								},
								set() {
									isDoingOffRecordsMutations || logUnclaimedMutations();
									let result = prop.set.apply(this,arguments);
									isDoingOffRecordsMutations || logClaimedMutations("set "+propName, new Error().stack.replace(/^Error *\r?\n/i,''));
									return result;
								}
							});
							
						} catch (ex) {
							console.log(ex);
						}
						
					}
				}
			} catch (ex) {
				console.error("Gave up hooking into ", ""+protoName, ex.message);
			}
		}
		
		function wrapStyleInProxy(HTMLElement) {
			var propName = 'style';
			var prop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style');
			Object.defineProperty(HTMLElement.prototype, 'style', { 
				get() {
					try {
						let result = prop.get.apply(this,arguments);
						return wrapInProxy(
							result,
							propName,
							(claim)=>(isDoingOffRecordsMutations || logUnclaimedMutations()),
							(claim)=>(isDoingOffRecordsMutations || logClaimedMutations(claim, new Error().stack.replace(/^Error *\r?\n/i,'')))
						);
					} catch (ex) {
						if(ex.stack.indexOf("Illegal invocation")==-1) {
							throw ex;
						} else {
							console.log(ex);
						}
					}
				},
				set() {
					isDoingOffRecordsMutations || logUnclaimedMutations();
					let result = prop.set.apply(this,arguments);
					isDoingOffRecordsMutations || logClaimedMutations("set "+propName, new Error().stack.replace(/^Error *\r?\n/i,''));
					return result;
				}
			});
		}
		
		// some objects need special wrapping, which we try to get using a proxy
		function wrapInProxy(obj,objName,onbeforechange,onafterchange) {
			
			if(window.Proxy) {
				
				// wrap using proxy
				return new Proxy(obj, {
				  "get": function (oTarget, sKey) {
					return oTarget[sKey];
				  },
				  "set": function (oTarget, sKey, vValue) {
					onbeforechange("set " + objName + "." + sKey);
					var result = oTarget[sKey] = vValue;
					onafterchange("set " + objName + "." + sKey);
					return result;
				  }
				});
				
			} else {
				
				// wrap using exhaustive property forwarding
				var shapeSource = getComputedStyle(document.documentElement);
				var o = {__proto__:document.documentElement.style.__proto__};
				Object.keys(shapeSource).forEach(function(key) {
					var lowerKey = key.replace(/./,c=>c.toLowerCase());
					var upperKey = key.replace(/./,c=>c.toUpperCase());
					var cssKey = key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());
					var cssPrefixKey = '-'+cssKey;
					// create a getter for that key
					if(lowerKey in obj) {
						Object.defineProperty(o, lowerKey, {
							get: function() { 
								return obj[lowerKey]; 
							},
							set: function(value) { 
								onbeforechange("set " + objName + "." + key);
								var result = obj[lowerKey]=value;
								onafterchange("set " + objName + "." + key);
								return result;
							}
						});
					}
					// create a getter for a possible hidden key
					if(upperKey in obj) {
						Object.defineProperty(o, upperKey, {
							get: function() { 
								return obj[upperKey]; 
							},
							set: function(value) { 
								onbeforechange("set " + objName + "." + key);
								var result = obj[upperKey]=value;
								onafterchange("set " + objName + "." + key);
								return result;
							}
						});
					}
					// create a getter for a possible hidden css key
					if(cssKey in obj) {
						Object.defineProperty(o, cssKey, {
							get: function() { 
								return obj[cssKey]; 
							},
							set: function(value) { 
								onbeforechange("set " + objName + "." + key);
								var result = obj[cssKey]=value;
								onafterchange("set " + objName + "." + key);
								return result;
							}
						});
					}
					// create a getter for a possible hidden prefixed css key
					if(cssPrefixKey in obj) {
						Object.defineProperty(o, cssPrefixKey, {
							get: function() { 
								return obj[cssPrefixKey]; 
							},
							set: function(value) { 
								onbeforechange("set " + objName + "." + key);
								var result = obj[cssPrefixKey]=value;
								onafterchange("set " + objName + "." + key);
								return result;
							}
						});
					}
				});
				
			}
			
		}
		
	}
	
	// 
	// execute the action which cancels a mutation record
	// 
	function undoMutationRecord(change) {
		switch(change.type) {
			
			//
			case "attributes":
				change.target.setAttribute(change.attributeName, change.oldValue);
			return;
			
			//
			case "characterData":
				change.target.nodeValue = change.oldValue;
			return;
			
			//
			case "childList":
				if(change.addedNodes) {
					for(var i = change.addedNodes.length; i--;) {
						change.addedNodes[i].remove();
					}
				} 
				if(change.removedNodes) {
					var lastNode = change.nextSibling;
					for(var i = change.removedNodes.length; i--;) {
						change.target.insertBefore(change.removedNodes[i], lastNode);
						lastNode = change.removedNodes[i];
					}
				}
			return;
			
		}
	}
	
	// 
	// execute the action which replicates a mutation record
	// 
	function redoMutationRecord(change) {
		switch(change.type) {
			
			//
			case "attributes":
				change.target.setAttribute(change.attributeName, change.newValue);
			return;
			
			//
			case "characterData":
				change.target.nodeValue = change.newValue;
			return;
			
			//
			case "childList":
				if(change.addedNodes) {
					var lastNode = change.nextSibling;
					for(var i = change.addedNodes.length; i--;) {
						change.target.insertBefore(change.addedNodes[i], lastNode);
						lastNode = change.addedNodes[i];
					}
				} 
				if(change.removedNodes) {
					for(var i = change.removedNodes.length; i--;) {
						change.removedNodes[i].remove();
					}
				}
			return;
			
		}
	}
	
}();

//
// this is where we enable to "dom timeline animation" demo on pressing down F10
//
void function() {
	
	// enable shortcut for animation
	window.addEventListener('keydown', e=>{ if(e.keyCode==121) animateDOMHistory(); }, true);

	function animateDOMHistory() {
		
		if(animateDOMHistory.timer) { 
			console.log("stopping animation (we may be locked in the past)");
			window.clearInterval(animateDOMHistory.timer); 
			animateDOMHistory.timer = 0;
			return;
		}
		
		var historyLength = (domHistory.past.length + domHistory.future.length);
		
		var wait = 0;
		var wait3s = 3000/(10000/historyLength);
		
		console.log("starting animation");
		while(domHistory.past.length > 0) {
			domHistory.undo();
		}
		
		animateDOMHistory.timer = window.setInterval(function() { 
			if(domHistory.future.length == 0) {
				if(wait == 0) console.log('start waiting');
				if(wait++ >= wait3s) {
					console.log('rewinding all events');
					while(domHistory.past.length > 0) {
						domHistory.undo();
					}
					wait = 0;
				}
			} else {
				domHistory.redo();
			}
		},10000/historyLength);
		
	}
}();

//
// we are done :-)
//
"setup completed without error";