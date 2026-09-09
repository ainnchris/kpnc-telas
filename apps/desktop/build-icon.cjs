'use strict';
// Package the existing brand PNG as a Windows ICO without redrawing the logo.
const fs=require('node:fs'),path=require('node:path');
const png=fs.readFileSync(path.join(__dirname,'assets/favicon.png'));
const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
if(width>256||height>256||width!==height)throw new Error('Expected square PNG <=256px');
const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);
header[6]=width===256?0:width;header[7]=height===256?0:height;
header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
fs.writeFileSync(path.join(__dirname,'assets/icon.ico'),Buffer.concat([header,png]));
