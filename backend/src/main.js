"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = require("express");
var path_1 = require("path");
var app = (0, express_1.default)();
var PORT = 8080;
app.use(express_1.default.static(path_1.default.join(import.meta.dirname, "./web/")));
app.listen(PORT, function () {
    console.log("Listening on http://[::1]:".concat(PORT));
});
