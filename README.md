doczar
======
Doczar (pronounced **dōzer** as in *bulldozer*) is a documentation generator. It is used to generate
[its own docs.](http://shenanigans.github.io/node-doczar/docs/module/doczar/index.html)

`doczar` features an advanced static analysis tool for generating documentation automatically with a
minimum of explicit documentation required. Conversely, the tag dialect emphasizes easy explicit
definitions. In fact, `doczar` was originally designed to avoid the syntax analysis probem
altogether with a streamlined explicit tag dialect requiring the same or less typing load than
typically required by existing generators.

Currently, `doczar` supports javascript in browser and [Node.js](https://nodejs.org) runtimes.
Future supported languages are planned to include C/C++/C#, Java, Python, Go, and PHP.


|    | Table Of Contents
|---:|-------------------------------
|  1 | [Installation](#installation)
|  2 | [Shell Usage](#shell-usage)
|  3 | [Syntax Analysis](#syntax-analysis)
|  4 | [Comment Syntax](#comment-syntax)
|  5 | [Documents and Spares](#documents-and-spares)
|  6 | [Functions](#functions)
|  7 | [Inheritence](#inheritence)
|  8 | [Events and Errors](#events-and-errors)
|  9 | [Javascript ES6](#javascript-es6)
| 10 | [LICENSE](#license)



Installation
------------
`doczar` is a cross-platform application based on [Node.js](https://nodejs.org/en/). You will need
to have it on your system.

The preferred installation method is to use `npm` with the global `-g` flag. This will install
`doczar` within your executable path.
```shell
$ sudo npm install -g doczar
$ doczar --with browser
```



Shell Usage
-----------
The default output path is `./docs/`. There is no input default whatsoever.
```shell
$ doczar --in=src/**/*.c --out docz
$ doczar --jsmod ./index
```

option             | description
------------------:|--------------------------------------------------------------------------------
--o, --out         | Selects a directory to fill with documentation output. The directory need not exist or be empty. The default output directory is `./docs`.
--i, --in          | Selects files to document. Parses nix-like wildcards using [glob](https://github.com/isaacs/node-glob). `doczar` does not parse directories - you must select files. There is no default search path.
--j, --js, --jsmod | Loads the filename with [required](https://github.com/defunctzombie/node-required) and documents every required source file.
--node             | Automatically fills the `--jsmod`, `--parse` and `--root` options for a Node.js module by reading `./package.json`.
--with             | Include a prebuilt standard library in the documentation. Standard libraries may be selected automatically when using other options (such as `--jsmod` or `--parse`) which imply a specific environment.
--parse            | [Parse](#syntax-parsing) selected files as source code using inline documentation. Mimics the more familiar behavior of javadoc-derived documentation systems.
--root             | Prefixes a path to every documented or parser-generated declaration. The root path is overridden by the first `@module` directive found in each file. The path of a `@module` tag is **never** affected by the `--root` option. The `--parse` option does not apply the root path to external dependencies.
--dev              | Display Components marked with the `@development` modifier.
--api              | Display **only** Components marked with the `@api` modifier.
--raw              | Log console events as json strings instead of pretty printing them. (`doczar` uses [Bunyan](https://github.com/trentm/node-bunyan) logging)
--json             | Create an `index.json` file in each directory instead of a rendered `index.html`.
--date             | By default, every page is marked with the (local) time it was generated. This option explicitly sets the datestamp on each page. Accepts any date/time string compatible with the common javascript Date constructor.
--noDeps, --nodeps | Skip library dependencies.
--noImply, --noimp | Do not allow shell options to load a standard doc library by implying the `--with` option.
--jTrap, --jtrap   | Ensures that all javadoc-flavored documentation produced by the parser is contained within the parent `@module`.



Syntax Analysis
---------------
`doczar` features a hollistic static analyzer that can load an entire dynamic-language application,
model the resulting architecture and infer typing. Interractions between each unit of the
application are simulated to create a complete picture of the underlying system.

Syntax analysis is activated with the `--parse` command line argument. Comments without formal
declarations are assumed to be markdown-format documentation for nearby lines of code. Comments with
formal declarations override the paths configured by the analyzer and may reconfigure the
documentation path used to refer to a line of code.

### Command Line Options
#### `--parse`
Activates syntax analysis and selects the language to parse.

##### `--parse js`
The simplest javascript parsing mode. Values in the scope of each file parsed are documented as
global values. Typical scope wrapping methods use in browser javascript are supported. ES6 features
are supported. Dependant files loaded with `import` will be assigned default module paths. When a
typical Browser/CommonJS/AMD compatibility shim is used, the browser context version of the file
will be documented.


##### `--parse node`
Used to document code written for the [Node.js](https://nodejs.org) javascript runtime. Names in the
local scope are treated as local names and documented (or not) depending on the value of the
`--locals` argument. By default, no local values are documented. Node conventions such as `global`
and `exports` are supported and a skeleton of the standard library will be injected during analysis.
 When a typical Browser/CommonJS/AMD compatibility shim is used, the browser context version of the
file will be documented.

#### `--root`
Sets the default module path for files that are selected directly by the `--in` argument. Further
files imported by the directly selected files will be assigned a default module path that begins
with this root path. If `doczar` detects that the imported file belongs to a source-managed
library, such as those loaded by `npm`, this file will instead receive a default path appropriate to
its source library. The root path is defined using the standard `doczar`
[path format](#components-types-and-paths).

The root path is overriden by the first `module` tag encountered in each file.

#### `--locals`
By default, names that exist only in an isolated local scope are not documented. You may use the
argument `--locals all` to document all detected local names, or `--locals comments` to document
only those local names with attached comments.

#### `--node`
Searches the current working directory for a `package.json` and uses it to automatically configure
the `--parse`, `--root` and `--with` arguments.

#### `--nodeps`
By default, `doczar` analyzes and documents every source file in the entire import tree. When
`--nodeps` is present, libraries managed by a tool such as `npm` will be ignored.


A comment is attached to a line of code by any of these means:
```javascript
/* A local name called `foo`. */
var foo = "bar";

// This comment is ignored.
// This comment is also ignored.
var bar = foo; // This comment is included!

/* @module OverriddenName
    Rather than the parsed name (`thingy`) this [Object]()
    will be documented as a module named `OverriddenName`.

    Everything later in the same file will become a child of the `OveriddenName` module.
*/
var thingy = {
    /* documented as OverriddenName.utilFunction */
    utilFunction:   function (information) {
        var disinformation = spin (information);
        return disinformation;
    }
};

var movieIndex = Math.floor (
    Math.random()*NEW_MOVIES.length
); // this comment will document `movieIndex`

var trailer = NEW_MOVIES[movieIndex].trailer; /*
    This comment will document `trailer`.
*/
```

### Javascript Caveats
If a constructor alters the `__proto__` property of the instance, members attached to the class by
other means will not be discarded. Consider the following fragment:

```javascript
function ClassConstructor (arg0, arg1) {
    this.__proto__ = {
        method1:    function(){ }
    };
}
ClassConstructor.prototype.method0 = function(){ };
```

`doczar` will document the `ClassConstructor` class as containing two methods, called `method0` and
`method1`. In reality, however, any real instance of `ClassConstructor` will not contain `method0`
while any real subclass will not contain `method1`.



Comment Syntax
--------------
### Declarations
An explicit doc comment is a block comment whose opening line contains only a Declaration. A
Declaration consists of a Tag usually followed by a path, for example `@property title`. Optionally,
one or more types may be specified, for example `@property:String|undefined title`. The following
lines may contain [modifiers](#modifiers),
[github-flavored markdown](https://help.github.com/articles/github-flavored-markdown/)
documentation, or additional Inner Declarations.

Block comments in c-like languages which are opened with exactly two asterisks in the javadoc
convention will be treated as javadoc comments. Javadoc-flavored comments are only supported in
[syntax analysis mode](#syntax-analysis).

```c
/*      @class MyClass
    C-like block comments support any number of asterisks
    *immediately after the slash* however `/* ` will
    cause your comment to be read as a javadoc-style comment.
*/
/************* @member MyClass#asteriskCount
    *Any* number of asterisks other than two is fine.
*/
```

The final newline is not required.
```c
/* @module BoxFactory */
int myInt = 42; /* @local:int myInt */

/*  @spare ExtraDocs
    These extra documents are part of the
    [BoxFactory](.) module. Their full
    path is `BoxFactory~ExtraDocs`.
*/
```

A special markdown caveat: you will need *two* newlines to terminate a bullet list.
```c
/*      @property:Function doTheThings
    Does all the things. It does:
     * the hottest things
     * the coolest things
     * all the things you could ever
        possibly imagine

    And it does them fast!
*/
```

If you are using the `--parse` option you may usually ommit the leading Declaration and simply get
right into your documentation.
```javascript
/* How often the user will
  be able to:
   * give you up
   * let you down
   * hurt you
*/
var timesGonna = "never";
```

Indentation of a markdown section is automagically normalized to the least-indented line and you may
include any number of tab and space characters before any Declaration. You may break in the middle
of a link, like so:
```c
/*  @member:int foo
    A contracted document with
    little available horizontal
    space that needs a [link]
    (http://google.com) to a
    search engine.
*/
```

To add a child with a standalone doc comment, simply specify a
[complex path](#components-types-and-paths) of any length.
```c
/*      @class FooClass
    A simple class.
*/
/*      @property:Function FooClass.getDefault
    Get a new default instance of FooClass.
*/
/*      @returns:FooClass FooClass.getDefault)defaultInstance
    A new FooClass instance with the default configuration.
*/
```

This is the complete list of tags:
 * `@module` organizational Component
 * `@class` instantiable class objects
 * `@struct` c-like structures
 * `@interface` Java interface
 * `@spare` bare markdown document
 * `@property` static property
 * `@member` instance property or method
 * `@event` event descriptions
 * `@throws` conditions causing an exception to be thrown
 * `@argument` optionally-named function or event argument
 * `@kwarg` python-style keyword argument
 * `@callback` callback function
 * `@returns` return value
 * `@signature` an alternate function signature
 * `@enum` list of named values
 * `@named` a named value in an `@enum`.


### Paths
In `doczar`, every unit of documentation may be referenced by a unique path and any unique path may
be specified as a type. The following delimiter characters are used:
 * `/` `@module`
 * `.` `@property`
 * `#` `@member`
 * `(` `@argument`
 * `)` `@returns`
 * `!` `@throws`
 * `+` `@event`
 * `&` `@signature`
 * `~` `@spare`

To use a name containing reserved characters or whitespace within a path, surround the name with
backticks, for example `\`Complex \\\`Module\\\` Name\`.fooProperty`. If a unit of documentation is
unnamed, as can occur with `@argument` or `@returns` for example, it can be referenced numerically,
for example `MyFunction(0` references the first argument of `MyFunction`.

When writing a type path, note that you can start in the file scope instead of from the root by
starting your path with a delimiter. For example:
```javascript
/*  @module MyModule
    A package of functions and classes.
*/
/*  @property:class Result
    Result info wrapper class.
*/
/*  @property:Function getResult
    Get a Result object.
@returns:.Result
    Returns a new Result object.
*/
```

`doczar` supports pointers, arrays, and generics. For example:
```c++
/*  @property:Function fillWithAverage
    Fill a float pointer with the average of an array or [List](.List) of ints.
@argument:float* result
@argument:int[]:.List[int] values
@returns:bool
*/
```

You may also specify generics as part of your Class Declarations.
```c
/*      @class Container<Object elemType>
    A container of arbitrarily-typed references.
@function #get
    @argument:String elemName
        The name of the element to get.
    @returns:%elemType|null
        The requested element, or `null`.
*/
```


#### Crosslinking
You can easily crosslink to any other defined Component using the normal markdown link syntax. If
you start a crosslink path with a delimiter, the target will be rooted to the current module scope.
```c
/*      @module MyModule
    A simple module.
*/
/*      @class MyClass
    A simple class.
*/
/*      @property:Function clone
@argument:.MyClass source
    The [MyClass](.MyClass) instance to clone.
@returns:MyModule.MyClass
    The fresh [MyClass](MyModule.MyClass) instance.
*/
```

### Inner Declarations
Once you have opened a declaration, you may write additional declarations which will all be scoped
to the enclosing comment.

```c
/*      @class MyClass
    A simple class.
@property:Function getAllInstances
    A static Function that returns all instances of MyClass.
@member:Function doSomethingCool
    A member Function on each instance of MyClass.
*/
```


###Modules
The `@module` Declaration has an infectious scope. Every Declaration after it is scoped to the
module Component, as are value type paths that begin with a delimiter. See [crosslinking]
(#crosslinking) for more information. If you want to semantically declare a `@module` without
affecting the scope, use the `@submodule` declaration instead.

```c
/*      @module Foo
    The Foo module.
*/
/*      @class Bar
    The Foo.Bar class.
*/
/*      @submodule:class Baz
    The Foo/Baz module.
@property:Function createBar
    The Foo/Bar.createBar function.
*/
/*      @property:Function createBar
    The Foo.createBar function.
*/
```


### Modifiers and Flags
Modifiers, and their simpler counterpart Flags, are statements which modify the Declaration directly
above them rather than declaring a new Component. Modifiers have serious consequences for the
visibility and position of a Component and its children. Flags simply appear in the final
documentation as keywords in a contrasting color. Modifiers must appear before any markdown
documentation.
```c
/*      @class MyClass
    @super LisasClass
    @public
    A simple subclass of Lisa's class.
@member:String uniqueID
    @const
    This id String is generated at instantiation and because
    it is constant, it will never give you up, never let you
    down.
*/
```

Here is a list of the available Modifiers and Flags:

#### Modifiers
 * `@development` hides this Component unless the --dev flag is used
 * `@api` reveals this Component and its ancestors when the --api flag is used
 * `@optional` indicates something which need not exist (usually an argument)
 * `@super` inherits from a superclass
 * `@implements` associates an implemented Java interface
 * `@default` describes a default value. Always use backticks.
 * `@root` causes any given Component to affect the document scope as if it were a Module.
 * `@alias` copies the documentation from another path onto this Component
 * `@patches` copies this Component's documentation into another path
 * `@remote` replaces this Component's documentation with links to an internet url
 * `@default` documents this Component's default value
 * `@blind` indicates to the syntax parsing system that properties and members of a Component are not to be documented

#### Flags
 * `@public`
 * `@protected`
 * `@private`
 * `@abstract`
 * `@final`
 * `@volatile`
 * `@const`



Documents and Spares
--------------------
You may Declare a Component any number of times. Child Components and documentation accumulates in
the order in which it is loaded.
```c
/*      @class MyClass
    Some information about MyClass.
*/
/*      @class MyClass
    Some (more) information about MyClass.
*/
```

Available exclusively as an Inner Declaration, `@load` allows you to pull in an external markdown
document. Because in loaded docs it's valuable to support html hash links , i.e.
`[more info](#more-info)`, it is impossible to properly support localized paths when using `@load`.
Your links will be scoped to the global namespace and any type link starting with a delimiter will
be rejected.

This example is taken directly from the `doczar` doc comments.
```c
/*      @module doczar
    Select, load and parse source files for `doczar`-format
    documentation comments. Render html output to a
    configured disk location.
@spare README
    This is the rendered output of the `doczar` source
    documentation. *View the [source]
    (https://github.com/shenanigans/node-doczar) on GitHub!*
    @load
        ./README.md
*/
```


In the first stage of rendering, the markdown document(s) on a Component are moved into new `@spare`
instances. The normal documentation appearing after a Declaration is moved to the path `~summary`.
When available, `~summary` is used when a Component is displayed on another Component's output page,
and `~details` is used on a Component's own page. If you choose to manually specify only one of
these two paths, all accumulated documentation not associated with a `@spare` will default to the
unspecified path. When both paths are specified, unassociated documentation is appended to
`~details`.

There is no limit to how many spares a Component may have, however their titles are subject to
normal namespace restrictions (sorry).
```c
/*      @class FooClass
    Basic information.
@spare details
    Detailed information.
*/
/*      @class FooClass
    More basic information.
*/
/*      @class BarClass
    Detailed information.
@spare summary
    Basic information.
*/
/*      @class BarClass
    More detailed information.
*/
```



Functions
---------
The Inner Declarations `@argument`, `@kwarg`, `@callback`, `@signature` and `@returns` are used to
describe Functions. During parsing, these Components have special scoping which is designed to help
intuitively document an entire Function in one tag. Never forget that this special scope *only*
affects these Component types *exclusively*. The scope will be immediately reset by the first
normal Declaration.

Here is a simple Function Declaration with `@argument` and `@returns` declarations. You may name
your arguments and return values, or not.
```c
/*      @property:Function doTheDew
    Do the Dew until you can't even.
@argument:Number volume
    Volume of Dew to do, in fluid ounces.
@argument:String method
    How to do the Dew.
@returns:String message
    Returns a hip phase, such as "Totally radical!!!".
*/
```

```c
/*      @property:Function sortItems
    A sorting function for Item instances.
@argument:Item
    The first Item.
@argument:Item
    The second Item.
@returns:Number
    -1, 0, or 1.
*/
```

Keyword arguments are as easy as replacing `@argument` with `@kwarg`.
```c
/*      @property:Function tellParrotJoke
    Repeat some Monty Python jokes about a parrot.
@kwarg:String parrotType
    Type of parrot to joke about.
*/
```


### Callback Functions
The `@callback` Declaration expands the `@argument` scope in order to document the callback
Function's arguments. You may reclose this scope with any unnamed `@returns` Declaration. You may
name your callbacks, or not.
```c
/*      @property:Function loadDefinitions
    Load definition file from the remote server.
@argument:String hostname
    URL of the remote server.
@callback
    @argument:Error|undefined error
        If a fatal Error prevented the file from
        being loaded properly, it is passed to
        the callback.
    @argument:Buffer|undefined definitionsFile
        The loaded definitions file, or `undefined`
        if an Error occured.
    @returns
@argument:Boolean devLogging
    @optional
    Activate development-mode logging messages.
*/
```

It is possible to document multiple `@returns` Declarations on a `@callback`. You can still close
the scope manually with a blank `@returns` Declaration.
```c
/*      @property:Function getJiggyWithIt
    Get jiggy with it.
@callback onError
    Called if a fatal Exception occured.
    @returns:function responseAction
        What to do about the Exception.
    @returns:Number priority
        How important this reaction is.
    @returns
@callback onSuccess
    Called if we got jiggy successfully.
    @argument:Number jigginessLevel
        Maximum level of jigginess achieved.
*/
```


### Function Signatures
If you're writing an overloaded function with multiple signatures or need to document special
permutations of optional arguments, `@signature` is there for you. It redefines the return value and
argument signature and documents the signature separately.

When you create a `@signature` with an Inner Declaration, the scope rules for Functions and
`@argument` Components apply.
```c
/*      @property:Function writeBuffer
    Interprets the contents of a Buffer as UTF-8
    and writes it in the sky with smoke signals.
@signature:Number (content)
    Write out the entire Buffer and return the
    number of bytes written.
@signature:Number|undefined (content, bytes)
    Write up to `bytes` bytes of text from
    `content`. If there is content remaining,
    returns the number of unwritten bytes.
@argument:Buffer content
    Text content to skywrite.
@argument:Number bytes
    Limit output to a set number of bytes.
*/
```

Signatures may be declared in their own comments.
```c
/*      @signature writeBuffer (content, bytes)
    Write up to `bytes` bytes of text from `content`.
    If there is content remaining, returns the number
    of unwritten bytes.
```

You may also define a signature with value types. These types have no additional implications, they
are only displayed in the documentation (and crosslinked).
```c
/*      @property:Function write
    Output information through the Morse telegram interface.
@argument content
    The content to send.
@signature (String content)
    Send the content as ascii text, followed by `STOP`.
@signature (Number content)
    Convert the number to ascii text and send, followed
    by `STOP`.
@signature (Array<String> content)
    Send each message, delimited and terminated with
    `STOP`.
*/
```

Signatures cannot be inherited or overridden individually.



Inheritence
-----------
To inherit static and member properties from another Component of any type, use the `@super`
modifier.
```c
/*      @class BaseClass
    A simple base class.
@Function createDefault
    Create and return a default instance.
    @returns:.BaseClass
@Function #toString
    Produce a String representation of this instance.
*/
/*      @class SubClass
    A simple subclass.
@Function #toString
    Overrides `BaseClass#toString`.
*/
```

If a Component with a superclass also has at least one value type that is exactly `"function"` or
`"Function"`, it will also inherit arguments, signatures, return values and thrown exceptions.

Java interfaces are also supported, with `@interface` and `@implements`.
```c
/*      @interface UniversalRemote
    The common interface for a universal remote control.
@member:Function volumeUp
    Increase speaker volume.
@member:Function volumeDown
    Decrease speaker volume.
*/
/*      @class Tamtung_Model042_3
    @implements .UniversalRemote
@member:Function volumeUp
    Increase speaker volume.
@member:Function volumeDown
    Decrease speaker volume.
*/
```



Events and Errors
-----------------
Document events with the `@event` declaration. Pass information with your Event by attaching
`@argument` Components.
```c
/*      @class Element
    An HTML DOM Element.
@event click
    Sent when a user presses down and releases the
    same mouse button within the bounding box of this
    Element, without exceeding the host browser's
    minimum threshold for [drag](Element+drag) events.
    Unless cancelled, this event bubbles upward and
    occurs in parent Elements until the `document` is
    reached.
    @argument:MouseEvent
        The originating mouse event.
*/
```

Cases which cause exceptions to be thrown may be documented with the simple Declaration `@throws`.
You may name your exception cases, or not.
```python
class dict:
    """     @class dict
        A hash map of Strings to untyped references.
    """
    def get (self, key):
        """     @member:function dict#get
            Retrieve a reference.
        @throws/KeyError notFound
            Failure to find a key results in an exception.
        @throws/TypeError
            If the key reference does not implement
            `__hash__`, a TypeError is raised.
        """
```




Javascript ES6
--------------
There is standard library coverage for ES6. Call `doczar` with the `--with es6` option.
Additionally, the `browser-strict` and `iojs` standard libraries will pull in ES6 documentation.

Several additional tricks were added to `doczar` itself to support the documentation of `ES6`
scripts.

### Symbols
Symbols are supported inline everywhere normal paths are supported. You may use either absolute or
locally rooted paths in Symbols.
```c
/*      @module MainPackage */

/*      @class FooList
    An Iterable collection of Foos.
@member:Function [Symbol.iterator]
    Create an [Iterator]() that lists all our Foos.
@property:Symbol staticSymbol
    A Symbol stored statically on the FooList class.
*/

/*      @member:String FooList#[.FooList.staticSymbol]
    A String stored on FooList instances, mapped to a
    static symbol.
*/
```

```c
/*      @class Foo
    @root
@property:Symbol alfa
    A static Symbol mapped to a String.
@property:Symbol [.alfa]
    A static Symbol mapped to a static Symbol.
@property:Symbol [.[.alfa]]
    Another static Symbol mapped to a static Symbol.
@member:String [.[.[.alfa]]]
    A String mapped to a static Symbol.
*/
```

### Rest and Spread
To document use of the `rest` keyword or "spread" syntax to accept arbitrary numbers of arguments,
use the `@args` declaration.
```c
/*      @member:Function Foo#methodAlfa
    A method that takes at least one argument.
@argument:String firstArgument
    The first, mandatory argument.
@args:Number restArguments
    An arbitrary number of additional arguments.
*/
```



LICENSE
-------
The MIT License (MIT)

Copyright (c) 2015 Kevin "Schmidty" Smith

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

