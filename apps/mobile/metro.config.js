const path = require('node:path');
const {getDefaultConfig} = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing)?existing:existing?[existing]:[]),
  new RegExp(escaped(path.resolve(__dirname,'../../work'))+'[/\\\\]'),
  new RegExp(escaped(path.resolve(__dirname,'../desktop/dist'))+'[/\\\\]'),
];
module.exports = config;
