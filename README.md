node-doczar
===========
   | Table Of Contents
---|-------------------------------
 1 | [Installation](#Installation)
 2 | [Usage](#Usage)

Doczar (pronounced **dozer**) is a simple, explicit documentation generator for all languages.

Rather than attempting to document the source code itself, doczar *only* uses tagged comments. The
comment format has been designed for legibility and uses a simple scope model to make documenting
large, complex entities easy.

Doczar itself is fully cross-platform, open source, and *totally sweet*.

Installation
------------
You will need [node.js and npm](http://nodejs.org/).
```shell
# npm install -g doczar
```
The binary `doczar` is now on your executable path.

Usage
-----
```shell
$ doczar --out docs --in src/**/*.c
$ doczar --out docs --jsmod main.js --with nodejs
```
option          | description
----------------|---------------------------------
o, out          | Selects a directory to fill with documentation output. The directory need not exist or be empty.
i, in           | Selects files to document. Parses nix-like wildcards using [glob](https://github.com/isaacs/node-glob).
j, js, jsmod    | Loads the filename with [required](https://github.com/defunctzombie/node-required) and documents every required source file.
w, with         | Start with a pre-packaged documentation library for your environment.
dev             | Display Components marked with the @development flag.
api             | Display **only** Components marked with the @api flag.
v, verbose      | Output detailed information about the documentation process.

Doc Comment Syntax
------------------
The parser is compatible with c-like syntaxes and python.
