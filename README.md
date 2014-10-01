node-doczar
===========
   | Table Of Contents
---|-------------------------------
 1 | [Installation](#installation)
 2 | [Shell Usage](#shell-usage)
 3 | [API](#api)
 4 | [Examples](#examples)
 5 | [Doc Comment Syntax](#doc-comment-syntax)

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

Shell Usage
-----------
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

API
---
> *nothing here but us chickens!*

Examples
--------
**all indentation is optional**

The simplest form of document comment: a single [declaration](#doc-comment-syntax) in its own block
comment.
```c
/**     @class FooBox
    Represents a box of foos.
*/
```

The easiest way to document something a little more interesting is to use subdeclarations. You may
also declare one or more value types for each component. Subdeclaration paths are scoped to the
first Component declared in the comment.
```c
/**     @class FooBox
    Represents a box of foos.
@argument/Number maxCount
    The maximum number of foos to store.
@member/Number count
    The current number of foos in this `FooBox`.
@member/foo|undefined latest
    The most recent foo added to this `FooBox`.
```

The `@module` declaration has an infectious scope. Every subsequent decaration in the current source
file is automatically the child of the declared `module`.
```c
/**     @module foocontainers
    An assortment of useful collections for storing foos.
*/
/**     @class FooBox
    Represents a box of foos.
*/
```

Function-related declarations have a special scope. `argument` and `callback` declarations apply to
the most recently declared `Component`. Adding one or more `returns` declarations will manually
close the scope.
```c
/**     @class FooBox
    Represents a box of foos.
@member/Function storeFoo
    Add a foo to this box.
    @argument/foo foo
        The foo to store.
    @callback okCall
        Called back if the operation completes successfully.
        @argument/Number count
            The current number of foos stored in this box.
        @returns
    @callback errCall
        Called back if the operation fails. `okCall` will not be called.
        @argument/Error err
            The Error that caused the operation to fail.
        @returns
    @returns String
        A friendly status message.
*/
```

Nearly every `Component` we declare has its own addressable path. Here we will add an additional
document to several children of a `Component` by selecting them by path in a second file. A `spare`
is simply an extra named markdown document which is associated with another `Component`.
```c
/**     @module foocontainers
    An assortment of useful collections for storing foos.
*/
/**     @class FooBox
    Represents a box of foos.
@spare additionalInfo
    Some more information about `FooBox` intances.
@property/Array allBoxes
    An Array of all `FooBox` instances with at least one `foo` inside.
@member/Function storeFoo
    Add a foo to this box.
    @argument/foo foo
        The foo to store.
    @callback callback
        @argument/Error err
            The Error which caused the operation to fail.
        @returns
    @returns/String
        A useful status message.
*/
```
```c
/**     @module foocontainers
@spare FooBox~additionalInfo
    This content will be added to the `spare` called "additionalInfo".
@spare FooBox.allBoxes~moreInfo
    A new `spare` is declared on the property `FooBox.allBoxes`.
@spare FooBox#storeFoo~moreInfo
    A new `spare` is declared on the method `FooBox#storeFoo`.
@spare FooBox#storeFoo(foo~moreInfo
    A new `spare` is declared on the argument `FooBox#storeFoo(foo`.
@spare FooBox#storeFoo{callback~moreInfo
    A new `spare` is declared on the callback function `FooBox#storeFoo{callback`.
@spare FooBox#storeFoo{callback(err~moreInfo
    A new `spare` is declared on the callback function's argument `FooBox#storeFoo{callback(err`.
@spare FooBox#storeFoo)~moreInfo
    A new `spare` is declared on the first return value of `FooBox#storeFoo`.
*/
```

You can specify shorter documentation for a complex `Component` by adding a `spare` called
"summary". The summary will be used whenever the `Component` is documented as a child.
```c
/**     @module foocontainers

    -- long documentation goes here --

@spare summary
    An assortment of useful collections for storing foos.
```

Since path delimiters imply the type of their `Component`, you can usually just jump right to the
value type. The default type is `property` so the leading delimiter may even be emitted for static
properties. You cannot open a new comment with this syntax, nor can you use it to create a `module`.
```c
/**     @class FooBox
@Array .allBoxes
    The unique name of this box.
@FooBox|undefined newestBox
    The most recently-created `FooBox` instance, if any.
@Function #storeFoo
    Add a foo to this box.
*/
```

To help make your documentation easier to navigate, doczar supports automatic links to another 
`Component`. An additional note about value types: if you start a type with a delimiter 
character, it is scoped as if you were creating a new comment at the same line in the same 
file.
```c
/**     @module NoduleHeap
    A monad heap of [Nodule](.Nodule) instances. Not to be confused with 
    [NoduleChain](NoduleChain) or its [Nodules](NoduleChain.Nodule).
*/
/**     @class Nodule
    A data unit containing arbitrary information.
*/
```
```c
/**     @module NoduleChain
    A monad chain of [Nodule](.Nodule) instances. Not to be confused with 
    [NoduleHeap](NoduleHeap) or its [Nodules](NoduleHeap.Nodule).
*/
/**     @class Nodule
    A data unit containing arbitray information.
@property/.Nodule first
    This is scoped to the current module.
*/
```

Doc Comment Syntax
------------------
The parser is compatible with c-like block comments, python docstrings and ruby's weird =begin/=end
syntax. C-like blocks may start with your preferred number of consecutive asterisks. In all
syntaxes, the first `@directive` must be on the same line as the characters which open the document
block.

### Components and Directives
Doczar assembles your docs into a tree of nodes, called Components. The types of components
available are:
 * **module:** An importable/require-able collection of related Components. A `module` is sufficiently flexible to support the crazy things javascript devs regularly export.
 * **class:** A constructor, with arguments, that produces instances of itself.
 * **spare:** Additional information related to a Component. Under the hood, *all* textual documentation lives inside a `spare`.
 * **property:** A static function or property of the parent `Component`. A simply reference/pointer from one static instance to another.
 * **member:** A property or method of an instance of the parent `Component`.
 * **argument:** An argument passed to a function. Optionally named.
 * **callback:** A specialized `argument` for documenting callback functions. Arguments of callback functions will be conveniently displayed whenever the `callback` is displayed as if it were an `argument`.
 * **returns:** The value returned from a function. Multiple return values are supported.

Components are created and described by `directives`, of which there are only two types.
 * A **declaration** creates or selects a `Component`. Most lines containing an @ symbol are declarations. They may be immediately followed by one or more `modifier` and a markdown document.
 * A **modifier** is a keyword starting with an @ symbol which applies a simple modification to the Component created or selected by a declaration.

### Paths

### Inline Links
