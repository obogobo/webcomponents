var express = require('express'),
    _ = require('lodash');

var app = express(),
    data = require('./public/data/beers.json');

// serve static
app.use(express.static('./public'));

// table route
app.get('/beers', function (req, res) {
    res.send(data);
});

// start server
var server = app.listen(1337, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log('listening at http://%s:%s', host, port);
});
