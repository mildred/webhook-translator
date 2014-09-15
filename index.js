var express = require('express');
var extend  = require('extend');
var https   = require('https');
var http    = require('http');
var sexp    = require('sexp');
var url     = require('url');
var app = express();

var ids = 0;

var env = {

  "let": function(env, code, cb){
    var e = extend({}, env);
    var i = 1;
    while (i < code.length) {
      var name  = code[i];
      var value = code[i+1];
      if(i+1 < code.length){
        evaluate(e, value, function(res){
          if(name instanceof Array) {
            env.log("register slot " + name[0]);
            e[name[0]] = res;
          } else {
            env.log("register slot " + name);
            e[name] = function(e, c, cb2){ cb2(res); };
          }
        })
        i+=2;
      } else {
        evaluate(e, name, cb);
        i++;
      }
    }
  },
  
  json: function(env, code, cb){
    evaluate(env, code[1], function(jsoncode){
      env.log("JSON parse: " + jsoncode);
      var json = JSON.parse(jsoncode);
      for(var i = 2; i < code.length; ++i) {
        json = json[code[i]];
        env.log("JSON get " + code[i] + ": " + json);
      }
      cb(json)
    });
  },
  
  cat: function(env, code, cb){
    var res = "";
    var i = 0;
    callback("");
    
    function callback(item){
      res = res + item;
      i = i + 1;
      if(i < code.length) {
        evaluate(env, code[i], callback);
      } else {
        cb(res);
      }
    }
  },
  
  urlencode: function(env, code, cb){
    evaluate(env, code[1], function(item){
      cb(encodeURIComponent(item));
    });
  },
  
  http: function(env, code, cb) {
    if(code[1] == "get") {
      evaluate(env, code[2], function(user_url){
        env.log("http get " + user_url)
        if(/^https:/.test(user_url)) {
          var opts = url.parse(user_url);
          opts.rejectUnauthorized = false;
          https.get(opts, function(res){
            cb(res);
          }).on('error', function(err){
            env.log(err);
          });
        } else {
          http.get(user_url, function(res){
            cb(res);
          }).on('error', function(err){
            env.log(err);
          });
        }
      });
      
    } else {
      cb(new Error(code[0] + " " + code[1] + " is not a valid http function"));
    }
  }

};

function evaluate(env, code, cb){
  if(code instanceof Array) {
    var f = env[code[0]];
    if (f === undefined) {
      throw new Error("Slot " + code[0] + " not registered")
    }
    f(env, code, cb);
  } else {
    cb(code);
  }
}

app.set('port', (process.env.PORT || 5000))
app.use(express.static(__dirname + '/public'))

app.get('/', function(request, response) {
  response.sendfile('index.html')
})

app.get('/*', function(request, response) {
  var id   = ++ids;
  var code = new Buffer(request.path.substr(1), 'base64').toString();
  var e = extend({}, env);
  
  e.req = function(env, code, cb){
    if(code[1] == "param") {
      cb(request.param(code[2]));
    } else {
      cb(new Error(code[0] + " " + code[1] + " is not a valid request function"));
    }
  }
  
  console.log(id + ": " + request.path.substr(1));
  e.log = function(item){
    console.log(id + ": " + item);
    response.write("log: " + item + "\n");
  }
  
  response.write("<!DOCTYPE html5>\n<pre>" + code);
  response.write("\n<a href=\"/#" + request.path.substr(1) + "\">edit</a>\n");
  response.write("\n\n");
  try {
    var res = evaluate(e, sexp(code), function(res){
      response.write("\nResult:\n");
      if(typeof res == 'object') {
        response.write(res.toString());
      } else {
        response.write("" + res);
      }
      response.end();
    });
  } catch(e) {
    response.status(500);
    response.write("\n" + e.stack);
    response.end();
  }
})

app.listen(app.get('port'), function() {
  console.log("Node app is running at localhost:" + app.get('port'))
})
