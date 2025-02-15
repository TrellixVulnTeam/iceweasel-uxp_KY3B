/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/PrivateBrowsingUtils.jsm");

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;

function LOG(str) {
  dump("*** " + str + "\n");
}

const WCCR_CLASSID = Components.ID("{792a7e82-06a0-437c-af63-b2d12e808acc}");

const WCC_CLASSID = Components.ID("{db7ebf28-cc40-415f-8a51-1b111851df1e}");
const WCC_CLASSNAME = "Web Service Handler";

const PREF_HANDLER_EXTERNAL_PREFIX = "network.protocol-handler.external";
const PREF_ALLOW_DIFFERENT_HOST = "gecko.handlerService.allowRegisterFromDifferentHost";

const STRING_BUNDLE_URI = "chrome://browser/locale/feeds/subscribe.properties";

const NS_ERROR_MODULE_DOM = 2152923136;
const NS_ERROR_DOM_SYNTAX_ERR = NS_ERROR_MODULE_DOM + 12;

const Utils = {
  makeURI(aURL, aOriginCharset, aBaseURI) {
    return Services.io.newURI(aURL, aOriginCharset, aBaseURI);
  },

  checkAndGetURI(aURIString, aContentWindow) {
    let uri;
    try {
      let baseURI = aContentWindow.document.baseURIObject;
      uri = this.makeURI(aURIString, null, baseURI);
    } catch (ex) {
      throw NS_ERROR_DOM_SYNTAX_ERR;
    }

    // For security reasons we reject non-http(s) urls (see bug 354316),
    // we may need to revise this once we support more content types
    if (uri.scheme != "http" && uri.scheme != "https") {
      throw this.getSecurityError(
        "Permission denied to add " + uri.spec + " as a content or protocol handler",
        aContentWindow);
    }

    // We also reject handlers registered from a different host (see bug 402287)
    // The pref allows us to test the feature
    let pb = Services.prefs;
    if (!pb.getBoolPref(PREF_ALLOW_DIFFERENT_HOST) &&
        (!["http:", "https:"].includes(aContentWindow.location.protocol) ||
         aContentWindow.location.hostname != uri.host)) {
      throw this.getSecurityError(
        "Permission denied to add " + uri.spec + " as a content or protocol handler",
        aContentWindow);
    }

    // If the uri doesn't contain '%s', it won't be a good handler
    if (uri.spec.indexOf("%s") < 0)
      throw NS_ERROR_DOM_SYNTAX_ERR;

    return uri;
  },

  // NB: Throws if aProtocol is not allowed.
  checkProtocolHandlerAllowed(aProtocol, aURIString, aWindowOrNull) {
    // First, check to make sure this isn't already handled internally (we don't
    // want to let them take over, say "chrome").
    let handler = Services.io.getProtocolHandler(aProtocol);
    if (!(handler instanceof Ci.nsIExternalProtocolHandler)) {
      // This is handled internally, so we don't want them to register
      throw this.getSecurityError(
        `Permission denied to add ${aURIString} as a protocol handler`,
        aWindowOrNull);
    }

    // check if it is in the black list
    let pb = Services.prefs;
    let allowed;
    try {
      allowed = pb.getBoolPref(PREF_HANDLER_EXTERNAL_PREFIX + "." + aProtocol);
    }
    catch (e) {
      allowed = pb.getBoolPref(PREF_HANDLER_EXTERNAL_PREFIX + "-default");
    }
    if (!allowed) {
      throw this.getSecurityError(
        `Not allowed to register a protocol handler for ${aProtocol}`,
        aWindowOrNull);
    }
  },

  // Return a SecurityError exception from the given Window if one is given.  If
  // none is given, just return the given error string, for lack of anything
  // better.
  getSecurityError(errorString, aWindowOrNull) {
    if (!aWindowOrNull) {
      return errorString;
    }

    return new aWindowOrNull.DOMException(errorString, "SecurityError");
  },
};

function WebContentConverterRegistrar() {
}

WebContentConverterRegistrar.prototype = {
  get stringBundle() {
    let sb = Services.strings.createBundle(STRING_BUNDLE_URI);
    delete WebContentConverterRegistrar.prototype.stringBundle;
    return WebContentConverterRegistrar.prototype.stringBundle = sb;
  },

  _getFormattedString(key, params) {
    return this.stringBundle.formatStringFromName(key, params, params.length);
  },

  _getString(key) {
    return this.stringBundle.GetStringFromName(key);
  },

  /**
   * See nsIWebContentHandlerRegistrar
   */
  removeProtocolHandler(aProtocol, aURITemplate) {
    let eps = Cc["@mozilla.org/uriloader/external-protocol-service;1"].
              getService(Ci.nsIExternalProtocolService);
    let handlerInfo = eps.getProtocolHandlerInfo(aProtocol);
    let handlers =  handlerInfo.possibleApplicationHandlers;
    for (let i = 0; i < handlers.length; i++) {
      try { // We only want to test web handlers
        let handler = handlers.queryElementAt(i, Ci.nsIWebHandlerApp);
        if (handler.uriTemplate == aURITemplate) {
          handlers.removeElementAt(i);
          let hs = Cc["@mozilla.org/uriloader/handler-service;1"].
                   getService(Ci.nsIHandlerService);
          hs.store(handlerInfo);
          return;
        }
      } catch (e) { /* it wasn't a web handler */ }
    }
  },

  /**
   * Determines if a web handler is already registered.
   *
   * @param aProtocol
   *        The scheme of the web handler we are checking for.
   * @param aURITemplate
   *        The URI template that the handler uses to handle the protocol.
   * @return true if it is already registered, false otherwise.
   */
  _protocolHandlerRegistered(aProtocol, aURITemplate) {
    let eps = Cc["@mozilla.org/uriloader/external-protocol-service;1"].
              getService(Ci.nsIExternalProtocolService);
    let handlerInfo = eps.getProtocolHandlerInfo(aProtocol);
    let handlers =  handlerInfo.possibleApplicationHandlers;
    for (let i = 0; i < handlers.length; i++) {
      try { // We only want to test web handlers
        let handler = handlers.queryElementAt(i, Ci.nsIWebHandlerApp);
        if (handler.uriTemplate == aURITemplate)
          return true;
      } catch (e) { /* it wasn't a web handler */ }
    }
    return false;
  },

  /**
   * See nsIWebContentHandlerRegistrar
   */
  registerProtocolHandler(aProtocol, aURIString, aTitle, aBrowserOrWindow) {
    LOG("registerProtocolHandler(" + aProtocol + "," + aURIString + "," + aTitle + ")");
    let haveWindow = (aBrowserOrWindow instanceof Ci.nsIDOMWindow);
    let uri;
    if (haveWindow) {
      uri = Utils.checkAndGetURI(aURIString, aBrowserOrWindow);
    } else {
      // aURIString must not be a relative URI.
      uri = Utils.makeURI(aURIString, null);
    }

    // If the protocol handler is already registered, just return early.
    if (this._protocolHandlerRegistered(aProtocol, uri.spec)) {
      return;
    }

    let browser;
    if (haveWindow) {
      let browserWindow =
        this._getBrowserWindowForContentWindow(aBrowserOrWindow);
      browser = this._getBrowserForContentWindow(browserWindow,
                                                 aBrowserOrWindow);
    } else {
      browser = aBrowserOrWindow;
    }
    if (PrivateBrowsingUtils.isBrowserPrivate(browser)) {
      // Inside the private browsing mode, we don't want to alert the user to save
      // a protocol handler.  We log it to the error console so that web developers
      // would have some way to tell what's going wrong.
      Services.console.
      logStringMessage("Web page denied access to register a protocol handler inside private browsing mode");
      return;
    }

    Utils.checkProtocolHandlerAllowed(aProtocol, aURIString,
                                      haveWindow ? aBrowserOrWindow : null);

    // Now Ask the user and provide the proper callback
    let message = this._getFormattedString("addProtocolHandler",
                                           [aTitle, uri.host, aProtocol]);

    let notificationIcon = uri.prePath + "/favicon.ico";
    let notificationValue = "Protocol Registration: " + aProtocol;
    let addButton = {
      label: this._getString("addProtocolHandlerAddButton"),
      accessKey: this._getString("addProtocolHandlerAddButtonAccesskey"),
      protocolInfo: { protocol: aProtocol, uri: uri.spec, name: aTitle },

      callback(aNotification, aButtonInfo) {
          let protocol = aButtonInfo.protocolInfo.protocol;
          let uri      = aButtonInfo.protocolInfo.uri;
          let name     = aButtonInfo.protocolInfo.name;

          let handler = Cc["@mozilla.org/uriloader/web-handler-app;1"].
                        createInstance(Ci.nsIWebHandlerApp);
          handler.name = name;
          handler.uriTemplate = uri;

          let eps = Cc["@mozilla.org/uriloader/external-protocol-service;1"].
                    getService(Ci.nsIExternalProtocolService);
          let handlerInfo = eps.getProtocolHandlerInfo(protocol);
          handlerInfo.possibleApplicationHandlers.appendElement(handler, false);

          // Since the user has agreed to add a new handler, chances are good
          // that the next time they see a handler of this type, they're going
          // to want to use it.  Reset the handlerInfo to ask before the next
          // use.
          handlerInfo.alwaysAskBeforeHandling = true;

          let hs = Cc["@mozilla.org/uriloader/handler-service;1"].
                   getService(Ci.nsIHandlerService);
          hs.store(handlerInfo);
        }
    };
    let notificationBox = browser.getTabBrowser().getNotificationBox(browser);
    notificationBox.appendNotification(message,
                                       notificationValue,
                                       notificationIcon,
                                       notificationBox.PRIORITY_INFO_LOW,
                                       [addButton]);
  },

  /**
   * Returns the browser chrome window in which the content window is in
   */
  _getBrowserWindowForContentWindow(aContentWindow) {
    return aContentWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                         .getInterface(Ci.nsIWebNavigation)
                         .QueryInterface(Ci.nsIDocShellTreeItem)
                         .rootTreeItem
                         .QueryInterface(Ci.nsIInterfaceRequestor)
                         .getInterface(Ci.nsIDOMWindow)
                         .wrappedJSObject;
  },

  /**
   * Returns the <xul:browser> element associated with the given content
   * window.
   *
   * @param aBrowserWindow
   *        The browser window in which the content window is in.
   * @param aContentWindow
   *        The content window. It's possible to pass a child content window
   *        (i.e. the content window of a frame/iframe).
   */
  _getBrowserForContentWindow(aBrowserWindow, aContentWindow) {
    // This depends on pseudo APIs of browser.js and tabbrowser.xml
    aContentWindow = aContentWindow.top;
    return aBrowserWindow.gBrowser.browsers.find((browser) =>
      browser.contentWindow == aContentWindow);
  },

  /**
   * See nsIFactory
   */
  createInstance(outer, iid) {
    if (outer != null)
      throw Cr.NS_ERROR_NO_AGGREGATION;
    return this.QueryInterface(iid);
  },

  classID: WCCR_CLASSID,

  /**
   * See nsISupports
   */
  QueryInterface: XPCOMUtils.generateQI(
     [Ci.nsIWebContentHandlerRegistrar,
      Ci.nsIFactory]),

  _xpcom_categories: [{
    category: "app-startup",
    service: true
  }]
};

function WebContentConverterRegistrarContent() {
}

WebContentConverterRegistrarContent.prototype = {
  registerProtocolHandler(aProtocol, aURIString, aTitle, aBrowserOrWindow) {
    // aBrowserOrWindow must be a window.
    let messageManager = aBrowserOrWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                         .getInterface(Ci.nsIWebNavigation)
                                         .QueryInterface(Ci.nsIDocShell)
                                         .QueryInterface(Ci.nsIInterfaceRequestor)
                                         .getInterface(Ci.nsITabChild)
                                         .messageManager;

    let uri = Utils.checkAndGetURI(aURIString, aBrowserOrWindow);
    Utils.checkProtocolHandlerAllowed(aProtocol, aURIString, aBrowserOrWindow);

    messageManager.sendAsyncMessage("WCCR:registerProtocolHandler",
                                    { protocol: aProtocol,
                                      uri: uri.spec,
                                      title: aTitle });
  },

  /**
   * See nsIFactory
   */
  createInstance(outer, iid) {
    if (outer != null)
      throw Cr.NS_ERROR_NO_AGGREGATION;
    return this.QueryInterface(iid);
  },

  classID: WCCR_CLASSID,

  /**
   * See nsISupports
   */
  QueryInterface: XPCOMUtils.generateQI(
                     [Ci.nsIWebContentHandlerRegistrar,
                      Ci.nsIFactory])
};

this.NSGetFactory =
  (Services.appinfo.processType === Services.appinfo.PROCESS_TYPE_CONTENT) ?
    XPCOMUtils.generateNSGetFactory([WebContentConverterRegistrarContent]) :
    XPCOMUtils.generateNSGetFactory([WebContentConverterRegistrar]);
