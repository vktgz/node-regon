/*
 * Copyright (c) 2016 Adam Kaczmarzyk <adaskaczmarzyk@gmail.com>
 *                    Mateusz Sych
 * Appsolut.ly
 * MIT Licensed
 */

var Enum = require('./enum'),
Transport = require('./transport'),
debug = require('debug')('worker'),
_ = require('lodash'),
Antigate = require('antigate'),
parseString = require('xml2js').parseString,
path = require("path"),
deasync = require('deasync'),
regonRepair = require('./utils').regonRepair;


var SOAP_1_1 = 1;
var SOAP_1_2 = 2;


var Service = function(options, callback) {
var _this = this;

if (typeof options == "function") {
  callback = options;
}

this.sandbox = options.sandbox || false;
this.wsdl = path.join(path.dirname(module.filename), '../')+'wsdl/UslugaBIRzewnPubl'+ (this.sandbox ? "Sandbox" : "") +'.xsd';
this.url = "https://wyszukiwarkaregon.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
this.urlSandbox = "https://wyszukiwarkaregontest.stat.gov.pl/wsBIR/UslugaBIRzewnPubl.svc";
this.action = "http://www.w3.org/2005/08/addressing";
this.key = options.key || process.env.GUSApiKey || 'aaaaaabbbbbcccccdddd';
this.transport = this.transport || {};
this.streamContext = null;
this.sid = null;
this.disableAsync = options.disableAsync || false;
this.autoLogin = options.autoLogin === false ? false : true;

this.streamContext = this.stream_context_create();

this.getSessionId = function() {
  return this.sid;
};

this.setInitialSessionId = function(sid) {

  this.sid = sid;
  debug('service.setInitialSessionId', 'Calling: ', sid);
  var isSessionCorrectAndActive = this.getValue(Enum.SESSION_STATUS);

  debug('service.setInitialSessionId', 'Session StatusSesji returned: ', isSessionCorrectAndActive);
  return isSessionCorrectAndActive;
};

this.login = function() {

  if (this.getSessionId())
    return this.getSessionId();

  var function_name = "Zaloguj";
  var params = {_xml:this.transport_class.getParams(function_name, _this.key)};
  var result = _this.call(function_name, params);

  if (!result.error)
    this.sid = result.response.ZalogujResult;
    
  if(!result.response.ZalogujResult)
    throw "Problem with login. Please check if you entered correct api key, and if sandbox is defined correctly.";

  return result;
};
this.Zaloguj = this.login;

this.logout = function(value) {
  var function_name = "Wyloguj";

  if (!value)
    value = this.getSessionId();

  var params =  {_xml:this.transport_class.getParams(function_name, value)};
  var result = _this.call(function_name, params);

  if (!result.error)
    this.sid = null;

  return result;
};
this.Wyloguj = this.logout;

this.getInfo = function() {
  var function_name = "DaneKomunikat";
  var params =  {_xml:this.transport_class.getParams(function_name)};
  var result = _this.call(function_name, params);

  return result.response[Object.keys(result.response)[0]];
};
this.DaneKomunikat = this.getInfo;

this.getValue = function(value) {
  var function_name = "GetValue";
  var params =  {_xml:this.transport_class.getParams(function_name, value)};
  var result = _this.call(function_name, params);

  return result.response[Object.keys(result.response)[0]];
};
this.GetValue = this.getValue;


this.getFullReport = function(value, type, silosId) {
//var type = "P";
  var self = this;
var function_name = '';
  if (!type)
    throw "You need to specify TYPE.";
  if (!value)
    throw "You need to specify REGON.";

  if (!this.getSessionId())
    throw "You need to make login request! SessionId is not defined.";

function_name = "DanePobierzPelnyRaport";
  var params = {_xml:this.transport_class.getParams(function_name, value, type, silosId)};
  var result = _this.call(function_name, params);
  return this.checkResult(result, function_name);
};
this.DanePobierzPelnyRaport = this.getFullReport;
this.DanePobierzPelnyRaportP = this.getFullReport;

this.search = function(params) {
  var paramsRenderered;

  debug('service.search', params);

  if (!params || !(paramsRenderered = _this.transport_class.getParamsValues(params)))
    throw "You need to specify correct search params, one or many of: Krs, Krsy, Nip, Nipy, Regon, Regony14zn, Regony9zn";

  var self = this;
  var function_name = "DaneSzukaj";

  if (!this.getSessionId())
    throw "You need to make login request! SessionId is not defined.";


  var paramsForXml = {_xml:this.transport_class.getParams(function_name, paramsRenderered)};

  var result = _this.call(function_name, paramsForXml, "xmlns:dat=\"http://CIS/BIR/PUBL/2014/07/DataContract\"");

  return this.checkResult(result, function_name);
};
this.DaneSzukaj = this.search;

this.findByNip = function(value) {
  return this.search({
    "Nip": value
  });
};

this.findByMultiNip = function(value) {
  return this.search({
    "Nipy": value
  });
};

this.findByRegon = function(value) {
  return this.search({
    "Regon": value
  });
};

this.findByRegony14zn = function(value) {
  return this.search({
    "Regony14zn": value
  });
};
this.findByMultiRegony14zn = this.findByRegony14zn;

this.findByRegony9zn = function(value) {
  return this.search({
    "Regony9zn": value
  });
};
this.findByMultiRegony9zn = this.findByRegony9zn;
this.findByMultiRegon = this.findByRegony9zn;

this.checkResult = function(result, function_name) {
  var self = this;
  var iterator = iterator || 0;
  var error = result.error;
  var response = result.response;

  var firstObject = response[Object.keys(response)[0]];

  //results found
  if (firstObject != null) {
    if (firstObject[0] == "[") {
      var json = JSON.parse(firstObject);
      delete result.response[Object.keys(response)[0]];
      result.response = json;
      return result;
    }
    var json = "";
    parseString(firstObject, function (err, result) {
        json = result;
    });
    // json = JSON.parse(json);
    if (json.root)
      if (json.root.dane)
        json = json.root.dane;

    delete result.response[Object.keys(response)[0]];
    if(typeof json[0] != undefined)
      result.response = json[0];
    else
      result.response = json;
    return result;
  }

  //check error code
  var errorCode = this.getValue(Enum.ERROR_CODE);

  if (errorCode == Enum.SEARCH_ERROR_INVALIDARGUMENT) {
    // throw  "Invalud arguments for function: " + function_name;
    return _.merge(result, {
      error: "Invalud arguments for function: " + function_name
    })
  }

  if (errorCode == Enum.SEARCH_ERROR_SESSION) {
    // throw  "Problem with session for function: " + function_name;
    return _.merge(result, {
      error: "Problem with session for function: " + function_name
    })
  }

  if (errorCode == Enum.SEARCH_ERROR_NOTAUTHORIZED) {
    // throw "You are not authorized to do this action for function: " + function_name;
    return _.merge(result, {
      error: "You are not authorized to do this action for function: " + function_name
    })
  }

  if (errorCode == Enum.SEARCH_ERROR_NOTFOUND) {
    return _.merge(result, {
      notFound: true
    })
  }

  return result;
};

this.call = function(function_name, arguments, additionalEnvelope) {
  var completed = false;
  var errorResponse = null;
  var valueResponse = null;
  var soapHeader = {
    "wsa:To": this.sandbox ? this.urlSandbox : this.url,
    "wsa:Action": this.transport_class.getAction(function_name)
  };

  this.transport.soapHeaders = [];
  this.transport.addSoapHeader(soapHeader);

  this.transport.clearSoapHeadersInside();
  this.transport.addSoapHeadersInside("xmlns:wsa", this.action);

  if (additionalEnvelope)
    this.transport.additionalEnvelope = additionalEnvelope;
  else
    this.transport.additionalEnvelope = "";

  if (this.sid)
    this.transport.addHttpHeader("sid", this.sid);


  debug('service.call', 'Start Calling: ', function_name, arguments, additionalEnvelope);

  this.transport[function_name](arguments, function(error, result, raw, soapHeader) {
    completed = true;
    errorResponse = error;
    valueResponse = result;
  });
  while (!completed) {
    deasync.sleep(100);
  }
  return {
    error: errorResponse,
    response: valueResponse
  };
};

var isTransportDone = false;
this.transport_class = new Transport(
  this.wsdl, {
    "soap_version": SOAP_1_2,
    "exception": true,
    "stream_context": this.streamContext,
    "location": this.sandbox ? this.urlSandbox : this.url
  },
  function(err, client) {
    _this.transport = client;

    //set initial session id
    if (options.sid) {
      debug('service', 'Custom SessionId is defined: ', options.sid);
      var isInitialSessionSet = _this.setInitialSessionId(options.sid);

      // throws error, if You decided to disable autologin, and if session is inactual
      if (isInitialSessionSet == "0" && !_this.autoLogin) {
        throw "Passed SessionId is incorrect. Please use login() function or remove incorrect sid from options parameter.";
      }

    }

    // login if there is no sess id and autoLogin is disabled
    if (!_this.getSessionId() && _this.autoLogin !== false)
      _this.login();

    isTransportDone = true;
    callback(err, _this);
  }
)

if (this.disableAsync)
  while (!isTransportDone) {
    deasync.sleep(100);
  }

return isTransportDone;
};

Service.prototype.stream_context_create = function(options, params) {
var resource = {};
options = options || {};

// BEGIN REDUNDANT
this.resourceIdCounter = this.resourceIdCounter || 0;

function Resource(type, id, opener) { // Can reuse the following for other resources, just changing the instantiation
  // See http://php.net/manual/en/resource.php for types
  this.type = type;
  this.id = id;
  this.opener = opener;
}
// END REDUNDANT
this.resourceIdCounter++;

resource = new Resource('stream-context', this.resourceIdCounter, 'stream_context_create');
resource.stream_options = options;
resource.stream_params = params;

return resource;
}

module.exports = Service;
