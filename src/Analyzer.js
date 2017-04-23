
/*  @module
    Converts a series of abstract syntax trees in [esprima](http://esprima.org/) format into a
    static model of an application. Walks the syntax file line by line, simulating unique function
    signatures and gathering all possible value types for each identifier. Creates "dereference
    chains" when identifiers are set from other identifiers. The model is populated early and
    completed late, eliminating all dependence on the order in which files are read.
*/

var pathLib  = require ('path');
var filth    = require ('filth');
var tools    = require ('tools');
var Parser   = require ('./Parser');
var Patterns = require ('./Parser/Patterns');

/*
    A filter function for ignoring the BODY and THIS symbols.
*/
function cloneShallowFilter (key) {
    return key === BODY || key === THIS;
}


/*
    Process an entire document of mixed code and documentation tags. This initial pass produces a
    loose structure of Nodes linked by the [DEREF]() property. Nodes are produced early and updated
    late to permit, for example, the simulated execution of call expressions when a function's
    body is not yet available. The result will not be suitable for [Component generation]
    (doczar.Generator) until it has been [pre-processed](.preprocessSyntaxTree).

    The `next` callback is used to queue further files for analysis. There is no guarantee against
    repeat requests. The calling context should ensure that each syntax file is only processed once.
@argument:doczar.ComponentCache context
    The syntax file's model root will be stored on this context.
@argument:String fname
    The full path of the syntax file that produced this AST.
@argument:String referer
    The full path of the entry point syntax file for the current module, package, etc.
@argument:Object tree
    An Esprima-compatible AST for a single syntax file.
@argument:doczar/src/langs/LangPack langPack
    Language- or environment-specific behaviours for analyzing this individual AST. This will
    *probably* always be required to be the same for every file in a context.
@argument:doczar.Parser/Path defaultScope
    The default root path of the current document, if it is not explicitly configured.
@callback next
    Schedule another file to be loaded.
    @argument:String filename
        Absolute path to load.
    @argument:String referer
        Absolute path of the entry point file for the current module.
*/
function processSyntaxFile (context, fname, referer, tree, langPack, defaultScope, next) {
    var baseNode = langPack.getRoot (context, fname, defaultScope, defaultScope);
    defaultScope = baseNode[ROOT];
    if (!baseNode[MODULE])
        baseNode[MODULE] = defaultScope;

    var dirname = pathLib.parse (fname).dir;
    var logger = context.logger.child ({ file:fname });

    function newNode (parent, seed) {
        var node = tools.newNode (seed);
        node[DOC] = fname;
        node[REFERER] = referer;
        if (parent) {
            node[ROOT] = parent[ROOT];
            node[MODULE] = parent[MODULE] || baseNode[MODULE];
        } else
            node[MODULE] = baseNode[MODULE];
        return node;
    }

    // hoist var statements and function declarations
    function hoistNames (target, body) {
        for (var i=0,j=body.length; i<j; i++) {
            var loc = body[i];
            switch (loc.type) {
                case 'VariableDeclaration':
                    for (var k=0,l=loc.declarations.length; k<l; k++) {
                        var name = loc.declarations[k].id.name;
                        var nameNode = target[name] = newNode();
                        nameNode[LINE] = loc.loc.start.line;
                    }
                    break;
                case 'FunctionDeclaration':
                    if (!loc.id)
                        break;
                    var name = loc.id.name;
                    if (!Object.hasOwnProperty.call (target, name)) {
                        var funcNode = target[name] = newNode();
                        funcNode[LINE] = loc.loc.start.line;
                    }
                    break;
                case 'TryStatement':
                    // recurse into block and handler
                    hoistNames (target, loc.block.body);
                    if (loc.handler)
                        hoistNames (target, loc.handler.body);
                    if (loc.finalizer)
                        hoistNames (target, loc.finalizer.body);
                    break;
                case 'IfStatement':
                    if (loc.consequent && loc.consequent.type === 'BlockStatement')
                        hoistNames (target, loc.consequent.body);
                    if (loc.alternate && loc.alternate.type === 'BlockStatement')
                        hoistNames (target, loc.alternate.body);
                    break;
                case 'ForStatement':
                case 'ForOfStatement':
                case 'ForInStatement':
                case 'WhileStatement':
                case 'DoWhileStatement':
                    hoistNames (target, loc.body);
                    break;
                default:
            }
        }
    }

    function walkLevel (level, scope, thisNode, deadLine, scopeParent, fnChain, fileScope) {
        /*
            Apply an argument signature to a CallExpression. `generateReturn` enables reprocessing
            the return value for individual expression arguments.
        */
        function processCallExpression (expression, target, generateReturn) {
            // get the Function's node and dig to the bottom of any unambiguous DEREF chain
            var callNode = getNode (scope, expression.callee);
            if (!callNode)
                return;
            var setFunctionPointer = callNode;
            var setFunctionChain = [];
            do {
                setFunctionChain.push (setFunctionPointer);
                if (setFunctionPointer[TYPES].indexOf ('Function') < 0)
                    setFunctionPointer[TYPES].push ('Function');
            } while (
                setFunctionPointer[DEREF]
             && setFunctionPointer[DEREF].length === 1
             && ( setFunctionPointer = setFunctionPointer[DEREF][0] )
             && setFunctionChain.indexOf (setFunctionPointer) < 0
            )

            // apply argument types to the Function's Node
            var args;
            if (callNode[ARGUMENTS])
                args = callNode[ARGUMENTS];
            else
                args = callNode[ARGUMENTS] = [];
            for (var i=0,j=expression.arguments.length; i<j; i++) {
                var arg;
                if (i < args.length)
                    arg = args[i];
                else {
                    arg = args[i] = newNode (callNode);
                    arg[NO_SET] = true;
                    arg[NAME] = [ '(', '' ];
                    arg[TRANSIENT] = true;
                }
                divineTypes (arg, expression.arguments[i]);
                if (callNode[SILENT])
                    arg[SILENT] = true;
            }

            // execute or defer a call test to produce a unique RETURNS for this call expression
            // if and only if there's no matching signature on the function already
            var argSig = expression.arguments.map (function (argExp) {
                return getNode (scope, argExp);
            });
            var targetRow;
            if (!callNode[SIGNATURES]) {
                targetRow = { args:argSig };
                callNode[SIGNATURES] = [ targetRow ];
            } else {
                // if there is a matching signature, return the stored RETURNS node
                for (var i=0,j=callNode[SIGNATURES].length; i<j; i++)
                    if (filth.compare (callNode[SIGNATURES][i].args, argSig)) {
                        if (callNode[SIGNATURES][i].returns)
                            return callNode[SIGNATURES][i].returns;
                        if (!generateReturn)
                            return callNode;
                        targetRow = callNode[SIGNATURES][i];
                        break;
                    }
                if (!targetRow) {
                    targetRow = { args:argSig };
                    callNode[SIGNATURES].push (targetRow);
                }
            }

            function simulateCallExpression (target, thisNode, body, doApply) {
                if (fnChain.length >= context.argv.maxDepth || fnChain.indexOf (callNode) >= 0)
                    return;
                localChain = fnChain.concat();
                localChain.push (callNode);

                // set up the function's inner scope
                var innerScope = doApply ?
                // var innerScope =
                    // new filth.SafeMap (scope, callNode[SCOPE])
                    new filth.SafeMap (callNode[SCOPE] || scope)
                  : new filth.SafeMap (scope)
                  ;
                for (var i=0,j=Math.min (argSig.length, callNode[ARGUMENTS].length); i<j; i++) {
                    var argName = callNode[ARGUMENTS][i][NAME];
                    if (
                        !argName
                     && target[ARGUMENTS]
                     && target[ARGUMENTS].length > i
                     && target[ARGUMENTS][i][NAME]
                    )
                        argName = target[ARGUMENTS][i][NAME]
                    if (!argName)
                        continue;
                    var argNode = argSig[i];
                    if (argNode && argNode[IS_COL]) {
                        var dummyParent = newNode (argNode[PARENT]);
                        if (callNode[SILENT])
                            dummyParent[SILENT] = true;
                        dummyParent[INSTANCE] = [ argNode ];
                        argNode = dummyParent;
                    }
                    var targetArg = doApply ? callNode[ARGUMENTS][i] : newNode (argNode);
                    targetArg[NO_SET] = true;
                    targetArg[TRANSIENT] = true;
                    if (argNode && targetArg[DEREF].indexOf (argNode) < 0)
                        targetArg[DEREF].push (argNode);
                    innerScope[argName[1]] = targetArg;
                }

                // if we aren't applying our results to the canonical function,
                // we must also be aware that names have not been hoisted in advance
                if (!doApply)
                    hoistNames (innerScope, body);

                // walk the function's body
                var localDeadLine = deadLine;
                for (var i=0,j=body.length; i<j; i++) {
                    walkLevel (
                        body[i],
                        innerScope,
                        callNode[THIS],
                        localDeadLine,
                        target,
                        localChain,
                        fileScope.concat()
                    );
                    localDeadLine = body[i].loc.end.line;
                }
            }

            if (!callNode[BODY]) {
                if (!callNode[WAITING_CALLS])
                    callNode[WAITING_CALLS] = [];
                if (!generateReturn) {
                    callNode[WAITING_CALLS].push (function (body) {
                        simulateCallExpression (callNode, callNode[THIS], body, true);
                    });
                    return callNode;
                }
                var dummy = newNode();
                dummy[RETURNS] = newNode();
                dummy[RETURNS][TRANSIENT] = true;
                targetRow.returns = dummy[RETURNS];
                callNode[WAITING_CALLS].push (function (body) {
                    simulateCallExpression (callNode, callNode[THIS], body, true);
                    simulateCallExpression (dummy, callNode[THIS], body, false);
                });
                return dummy[RETURNS];
            }

            // simulate immediately
            simulateCallExpression (callNode, callNode[THIS], callNode[BODY], true);

            if (!generateReturn)
                return callNode;

            var dummy = newNode();
            dummy[RETURNS] = newNode();
            dummy[RETURNS][TRANSIENT] = true;
            targetRow.returns = dummy[RETURNS];
            simulateCallExpression (dummy, callNode[THIS], callNode[BODY], false);
            return dummy[RETURNS];
        }

        // divine the type of an assignment
        function divineTypes (node, value, localThisNode) {
            switch (value.type) {
                case 'Identifier':
                    if (!Object.hasOwnProperty.call (scope, value.name)) {
                        scope[value.name] = newNode (scope);
                        scope[value.name][NAME] = [ '.', value.name ];
                    }
                    if (node[DEREF].indexOf (scope[value.name]) < 0)
                        node[DEREF].push (scope[value.name]);
                    if (scope[value.name][SILENT])
                        node[SILENT] = true;
                    return [];
                case 'MemberExpression':
                    var memberNode = getNode (scope, value);
                    if (memberNode) {
                        if (node[DEREF].indexOf (memberNode) < 0)
                            node[DEREF].push (memberNode);
                        if (memberNode[SILENT])
                            node[SILENT] = true;
                    }
                    return [];
                case 'Literal':
                    var tstr = filth.getTypeStr (value.value);
                    if (tstr != 'null')
                        if (tstr === 'regexp')
                            tstr = 'RegExp';
                        else
                            tstr = tstr[0].toUpperCase() + tstr.slice (1);
                    if (node[TYPES].indexOf (tstr) < 0)
                        node[TYPES].push (tstr);
                    return [ tstr ];
                case 'ArrayExpression':
                    if (node[TYPES].indexOf ('Array') < 0)
                        node[TYPES].push ('Array');
                    return [ 'Array' ];
                case 'ObjectExpression':
                    var props;
                    if (node[IS_COL])
                        props = node;
                    else {
                        if (node[TYPES].indexOf ('json') < 0)
                            node[TYPES].push ('json');
                        if (!node[PROPS])
                            node[PROPS] = tools.newCollection();
                        props = node[PROPS];
                    }
                    var lastPropDef;
                    for (var i=0,j=value.properties.length; i<j; i++) {
                        var propDef = value.properties[i];
                        // did we hoover up a trailing comment?
                        if (
                            lastPropDef
                         && propDef.leadingComments
                         && propDef.leadingComments[0].loc.start.line === lastPropDef.loc.end.line
                        ) {
                            var lastPropNode = props[lastPropDef.key.name];
                            processComments (propNode, {
                                loc:                lastPropDef.loc,
                                trailingComments:   [ propDef.leadingComments[0] ]
                            }, 0, node);
                        }
                        var propNode;
                        if (Object.hasOwnProperty.call (props, propDef.key.name))
                            propNode = props[propDef.key.name];
                        else {
                            propNode = props[propDef.key.name] = newNode (node);
                            propNode[LINE] = propDef.key.loc.start.line;
                            propNode[NAME] = [ '.', propDef.key.name ];
                        }
                        divineTypes (propNode, propDef.value, node);
                        processComments (
                            propNode,
                            propDef,
                            lastPropDef ? lastPropDef.loc.end.line : deadLine,
                            node
                        );
                        lastPropDef = propDef;
                    }
                    return [ 'Object' ];
                case 'BinaryExpression':
                    var tstr;
                    if (value.operator === '+') {
                        // either Number or String
                        // recurse into both arguments;
                    } else { // all binary ops other than + imply a Number return
                        tstr = 'Number';
                        if (node[TYPES].indexOf ('Number') < 0)
                            node[TYPES].push ('Number');
                        return [ 'Number' ];
                    }
                    break;
                case 'AssignmentExpression':
                    if (value.operator === '=') {
                        // single-equals side-effect syntax
                        var targetNode = getNode (scope, value.left, true);
                        if (!targetNode)
                            return [];
                        if (targetNode[NO_SET])
                            return [];
                        var dummy;
                        if (targetNode[IS_COL]) {

                            // something like Foo.prototype = {
                            divineTypes (targetNode, value.right, targetNode[PARENT]);
                            var refNode = node[IS_COL] ?
                                node
                              : ( node[MEMBERS] || ( ode[MEMBERS] = tools.newCollection() ) )
                              ;
                            if (refNode[DEREF].indexOf (targetNode) < 0)
                                refNode[DEREF].push (targetNode);
                            return [];
                        }
                        var gotTypes = divineTypes (targetNode, value.right);
                        for (var i=0,j=gotTypes.length; i<j; i++) {
                            var tstr = gotTypes[i];
                            if (node[TYPES].indexOf (tstr) < 0)
                                node[TYPES].push (tstr);
                        }
                        if (node[DEREF].indexOf (targetNode) < 0)
                            node[DEREF].push (targetNode);
                        return gotTypes;
                    } else if (value.operator === '+=') {
                        // either Number or String or Boolean
                    } else { // must be Number
                        if (node[TYPES].indexOf ('Number') < 0)
                            node[TYPES].push ('Number');
                        return [ 'Number' ];
                    }
                    break;
                case 'CallExpression':
                    var doProcess = langPack.trip (
                        'CallExpression',
                        context,
                        baseNode,
                        fname,
                        referer,
                        value,
                        newNode,
                        next,
                        node
                    );
                    if (!doProcess)
                        return [];
                    var returnNode = processCallExpression (value, node, true);
                    if (!returnNode)
                        return [];
                    if (node[DEREF].indexOf (returnNode) < 0)
                        node[DEREF].push (returnNode);
                    // propagate silence
                    if (returnNode[SILENT])
                        node[SILENT] = true;
                    return [];
                case 'ClassExpression':
                    if (node[TYPES].indexOf ('Function') < 0)
                        node[TYPES].push ('Function');

                    var innerScope = filth.SafeMap (scope);

                    if (value.superClass) {
                        var superNode = getNode (scope, value.superClass);
                        if (superNode) {
                            innerScope['super'] = superNode;
                            if (node[SUPER])
                                node[SUPER].push (superNode);
                            else
                                node[SUPER] = [ superNode ];
                        }
                    }
                    if (!node[MEMBERS]) {
                        node[MEMBERS] = tools.newCollection();
                        node[MEMBERS][PARENT] = node;
                    }
                    var members = node[MEMBERS];
                    hoistNames (scope, value.body.body);
                    for (var i=0,j=value.body.body.length; i<j; i++) {
                        var declaration = value.body.body[i];
                        walkLevel (
                            declaration,
                            innerScope,
                            node,
                            declaration.loc.end.line,
                            scope,
                            fnChain,
                            fileScope.concat()
                        );
                    }

                    // clear unchanged inherited keys from the inner scope
                    for (var key in innerScope)
                        if (innerScope[key] === scope[key])
                            delete innerScope[key];

                    return [ 'Function' ];
                case 'FunctionExpression':
                case 'ArrowFunctionExpression':
                    if (node[TYPES].indexOf ('Function') < 0)
                        node[TYPES].push ('Function');
                    if (value.id) {
                        if (!Object.hasOwnProperty.call (scope, value.id.name)) {
                            scope[value.id.name] = newNode();
                            scope[value.id.name][NAME] = [ '.', value.id.name ];
                        }
                        scope[value.id.name][DEREF].push (node);
                    }
                    // manage arguments
                    var args;
                    var localDeadLine = deadLine;
                    var lastArg;
                    if (node[ARGUMENTS]) {
                        args = node[ARGUMENTS];
                        for (var i=0,j=value.params.length; i<j; i++) {
                            if (i < args.length) {
                                args[i][NAME] = [ '(', value.params[i].name ];
                                if (node[SILENT])
                                    args[i][SILENT] = true;
                            } else {
                                var arg = args[i] = newNode (node);
                                arg[NAME] = [ '(', value.params[i].name ];
                                arg[TYPES] = [];
                                arg[DEREF] = [];
                                arg[NO_SET] = true;
                                arg[TRANSIENT] = true;
                                arg[SILENT] = Boolean (node[SILENT]);
                            }
                            processComments (args[i], value.params[i], localDeadLine, node);
                            if (
                                lastArg
                             && value.params[i].loc.start.line !== localDeadLine
                             && value.params[i].leadingComments
                             && value.params[i].leadingComments[0].loc.start.line === localDeadLine
                            )
                                processComments (lastArg, {
                                    loc:                value.params[i-1].loc,
                                    trailingComments:   [ value.params[i].leadingComments[0] ]
                                });
                            localDeadLine = value.params[i].loc.end.line;
                            lastArg = args[i];
                        }
                    } else {
                        var lastParam;
                        args = node[ARGUMENTS] = value.params.map (function (param) {
                            var arg = newNode (node);
                            arg[NAME] = [ '(', param.name ];
                            arg[TYPES] = [];
                            arg[DEREF] = [];
                            arg[NO_SET] = true;
                            arg[TRANSIENT] = true;
                            arg[SILENT] = Boolean (node[SILENT]);
                            processComments (arg, param, localDeadLine, node);
                            if (
                                lastArg
                             && param.loc.start.line !== localDeadLine
                             && param.leadingComments
                             && param.leadingComments[0].loc.start.line === localDeadLine
                            )
                                processComments (lastArg, {
                                    loc:                lastParam.loc,
                                    trailingComments:   [ param.leadingComments[0] ]
                                });
                            localDeadLine = param.loc.end.line;
                            lastArg = arg;
                            lastParam = param;
                            return arg;
                        });
                    }
                    var innerScope = new filth.SafeMap (scope);
                    for (var i=0,j=node[ARGUMENTS].length; i<j; i++) {
                        var arg = node[ARGUMENTS][i];
                        innerScope[arg[NAME][1]] = arg;
                    }
                    node[SCOPE] = innerScope;
                    var localDeadLine = deadLine;
                    node[BODY] = value.body.body;
                    if (!node[THIS])
                        node[THIS] = value.type === 'FunctionExpression' ?
                            node
                          : localThisNode || thisNode || node
                          ;
                    hoistNames (innerScope, value.body.body);
                    if (fnChain.length < context.argv.maxDepth && fnChain.indexOf (node) < 0) {
                        var localChain = fnChain.concat();
                        localChain.push (node);
                        for (var i=0,j=value.body.body.length; i<j; i++) {
                            walkLevel (
                                value.body.body[i],
                                innerScope,
                                node[THIS],
                                localDeadLine,
                                node,
                                localChain,
                                fileScope.concat()
                            );
                            localDeadLine = value.body.body[i].loc.end.line;
                        }
                        // run any waiting call tests
                        if (node[WAITING_CALLS]) {
                            var waitingCalls = node[WAITING_CALLS];
                            delete node[WAITING_CALLS];
                            for (var i=0,j=waitingCalls.length; i<j; i++) {
                                waitingCalls[i] (node[BODY]);
                            }
                        }
                    }
                    if (!node[REBASE])
                        node[REBASE] = function (base) {
                            // var item = newNode (node[PARENT], node);
                            var item = filth.circularClone (node, undefined, cloneShallowFilter);
                            delete item[MEMBERS];
                            var innerScope = new filth.SafeMap (scope, node[SCOPE]);
                            for (var i=0,j=node[BODY].length; i<j; i++) {
                                walkLevel (
                                    node[BODY][i],
                                    innerScope,
                                    base,
                                    localDeadLine,
                                    node,
                                    localChain,
                                    fileScope.concat()
                                );
                                localDeadLine = node[BODY][i].loc.end.line;
                            }
                            return item;
                        };
                    return [ 'Function' ];
                case 'NewExpression':
                    // get the type of the item instantiated
                    var typeNode = getNode (scope, value.callee);
                    if (!typeNode)
                        return;
                    var chain = [ typeNode ];
                    while (
                        typeNode[DEREF].length === 1
                     && chain.indexOf (typeNode[DEREF][0]) < 0
                    )
                        chain.push (typeNode = typeNode[DEREF][0]);
                    if (node[INSTANCE])
                        node[INSTANCE].push (typeNode);
                    else
                        node[INSTANCE] = [ typeNode ];
                    if (typeNode[SILENT])
                        node[SILENT] = true;
                    // apply argument info to constructor
                    var args;
                    if (typeNode[ARGUMENTS])
                        args = typeNode[ARGUMENTS];
                    else
                        args = typeNode[ARGUMENTS] = [];
                    for (var i=0,j=value.arguments.length; i<j; i++) {
                        var arg;
                        if (i < args.length)
                            arg = args[i];
                        else {
                            arg = args[i] = newNode();
                            arg[NO_SET] = true;
                            arg[NAME] = [ '(', '' ];
                        }
                        divineTypes (arg, value.arguments[i]);
                        if (typeNode[SILENT])
                            arg[SILENT] = true;
                    }
                    return [];
                case 'UnaryExpression':

                case 'UpdateExpression':

                case 'LogicalExpression':

                case 'ConditionalExpression':

                default:

            }

            return [];
        }

        // get a descriptor node for the path
        function getNode (initialPointer, level, shallow) {
            if (level.computed)
                return;
            var pointer = initialPointer;
            // var silent = Boolean (initialPointer[SILENT]);
            var silent = false;

            switch (level.type) {
                case 'ObjectExpression':
                case 'Literal':
                    var dummy = newNode();
                    divineTypes (dummy, level);
                    return dummy;
                case 'ArrayExpression':
                    var dummy = newNode();
                    dummy[TYPES].push ('Array');
                    return dummy;
                case 'MemberExpression':
                    pointer = getNode (pointer, level.object, shallow);
                    if (!pointer)
                        return;
                    if (pointer[SILENT])
                        silent = true;
                    if (
                        level.object.type === 'Super'
                     || level.object.type === 'ThisExpression'
                    ) {
                        if (!pointer[MEMBERS]) {
                            pointer[MEMBERS] = tools.newCollection();
                            pointer[MEMBERS][PARENT] = pointer;
                        }
                        pointer = pointer[MEMBERS];
                    } else if (pointer[INSTANCE] && pointer[INSTANCE].length === 1) {
                        pointer = pointer[INSTANCE][0];
                        if (!pointer[MEMBERS]) {
                            pointer[MEMBERS] = tools.newCollection();
                            pointer[MEMBERS][PARENT] = pointer;
                        }
                        pointer = pointer[MEMBERS];
                    }
                    break;
                case 'ThisExpression':
                    return thisNode;
                case 'Super':
                    if (Object.hasOwnProperty.call (initialPointer, 'super'))
                        pointer = initialPointer.super;
                    else
                        return;
                    break;
                case 'Identifier':
                    if (Object.hasOwnProperty.call (pointer, level.name))
                        pointer = pointer[level.name];
                    else {
                        pointer = pointer[level.name] = newNode (pointer);
                        pointer[NAME] = [ '.', level.name ];
                        pointer[LINE] = level.loc.start.line;
                    }
                    break;
                case 'FunctionExpression':
                case 'ArrowFunctionExpression':
                    var anon = newNode (initialPointer);
                    anon[TYPES].push ('Function');
                    anon[LINE] = level.loc.start.line;
                    var args = anon[ARGUMENTS] = [];
                    var lastArg;
                    for (var i=0,j=level.params.length; i<j; i++) {
                        var arg = newNode (initialPointer);
                        arg[NO_SET] = true;
                        arg[NAME] = [ '(', level.params[i].name ];
                        arg[TRANSIENT] = true;
                        args.push (arg);
                        processComments (arg, level.params[i], localDeadLine, node);
                        if (
                            lastArg
                         && level.params[i].loc.start.line !== localDeadLine
                         && level.params[i].leadingComments
                         && level.params[i].leadingComments[0].loc.start.line === localDeadLine
                        )
                            processComments (lastArg, {
                                loc:                level.params[i-1].loc,
                                trailingComments:   [ level.params[i].leadingComments[0] ]
                            });
                        lastArg = arg;
                        localDeadLine = level.params[i].loc.end.line;
                    }
                    anon[RETURNS] = newNode (initialPointer);
                    anon[RETURNS][TRANSIENT] = true;
                    anon[BODY] = level.body.body;
                    anon[THIS] = level.type === 'FunctionExpression' ? anon : (thisNode || anon);
                    // take our first pass through the body
                    var innerScope = anon[SCOPE] = new filth.SafeMap (scope);
                    for (var i=0,j=args.length; i<j; i++)
                        innerScope[args[i][NAME][1]] = args[i];
                    var localDeadLine = deadLine;
                    hoistNames (innerScope, level.body.body);
                    for (var i=0,j=level.body.body.length; i<j; i++) {
                        walkLevel (
                            level.body.body[i],
                            innerScope,
                            anon[THIS],
                            localDeadLine,
                            anon,
                            fnChain,
                            fileScope.concat()
                        );
                        localDeadLine = level.body.body[i].loc.end.line;
                    }
                    if (!anon[REBASE])
                        anon[REBASE] = function (base) {
                            // var item = newNode (anon[PARENT], anon);
                            var item = filth.circularClone (anon, undefined, cloneShallowFilter);
                            delete item[MEMBERS];
                            var innerScope = new filth.SafeMap (scope, node[SCOPE]);
                            for (var i=0,j=anon[BODY].length; i<j; i++) {
                                walkLevel (
                                    anon[BODY][i],
                                    innerScope,
                                    base,
                                    localDeadLine,
                                    base,
                                    localChain,
                                    fileScope.concat()
                                );
                                localDeadLine = anon[BODY][i].loc.end.line;
                            }
                            return item;
                        };
                    return anon;
                case 'NewExpression':
                    // get the type of the item instantiated
                    var typeNode = getNode (scope, level.callee);
                    if (!typeNode)
                        return;
                    var chain = [ typeNode ];
                    while (
                        typeNode[DEREF].length === 1
                     && chain.indexOf (typeNode[DEREF][0]) < 0
                    )
                        chain.push (typeNode = typeNode[DEREF][0]);
                    var dummy = newNode (initialPointer);
                    if (dummy[INSTANCE])
                        dummy[INSTANCE].push (typeNode);
                    else
                        dummy[INSTANCE] = [ typeNode ];
                    if (typeNode[SILENT])
                        dummy[SILENT] = true;
                    // apply argument info to constructor
                    var args;
                    if (typeNode[ARGUMENTS])
                        args = typeNode[ARGUMENTS];
                    else
                        args = typeNode[ARGUMENTS] = [];
                    for (var i=0,j=level.arguments.length; i<j; i++) {
                        var arg;
                        if (i < args.length)
                            arg = args[i];
                        else {
                            arg = args[i] = newNode (typeNode);
                            arg[NO_SET] = true;
                            arg[NAME] = [ '(', '' ];
                        }
                        divineTypes (arg, level.arguments[i]);
                        if (typeNode[SILENT])
                            arg[SILENT] = true;
                    }
                    return dummy;
                case 'BinaryExpression':
                    var dummy = newNode();
                    divineTypes (dummy, level, thisNode);
                    return dummy;
                default:
                    return;
            }

            var cycle = [];
            if (!shallow) {
                while (
                    pointer[DEREF]
                 && pointer[DEREF].length === 1
                 // && !pointer[TYPES].length
                 && cycle.indexOf (pointer[DEREF][0]) < 0
                )
                    cycle.push (pointer = pointer[DEREF][0]);
            }

            var stowThis;
            if (level.property) {
                if (
                    pointer[IS_COL]
                 && pointer[PARENT][INSTANCE]
                 && pointer[PARENT][INSTANCE].length === 1
                )
                    pointer = pointer[PARENT];

                if (pointer[INSTANCE] && pointer[INSTANCE].length === 1) {
                    pointer = pointer[INSTANCE][0];
                    if (!pointer[MEMBERS]) {
                        pointer[MEMBERS] = tools.newCollection();
                        pointer[MEMBERS][PARENT] = pointer;
                        pointer[MEMBERS][THIS] = pointer;
                    }
                    pointer = pointer[MEMBERS];
                    if (level.property.name === '__proto__')
                        return pointer;
                }

                if (level.property.name === 'prototype' && !pointer[IS_COL]) {
                    if (!pointer[MEMBERS]) {
                        pointer[MEMBERS] = tools.newCollection();
                        pointer[MEMBERS][PARENT] = pointer;
                        pointer[MEMBERS][THIS] = pointer;
                    }
                    return pointer[MEMBERS];
                } else if (level.property.name === '__proto__') {
                    if (pointer[IS_COL])
                        return pointer;
                    if (!pointer[MEMBERS]) {
                        pointer[MEMBERS] = tools.newCollection();
                        pointer[MEMBERS][PARENT] = pointer;
                        pointer[MEMBERS][THIS] = pointer;
                    }
                    return pointer[MEMBERS];
                }

                var lastStep = level.property.type === 'Identifier' ?
                    level.property.name
                  : level.property.value
                  ;

                stowThis = IS_COL in pointer ? pointer[PARENT][THIS] : pointer[THIS];

                var nameDelimit;
                if (pointer[IS_COL])
                    nameDelimit = '#';
                else {
                    nameDelimit = '.';
                    if (pointer[PROPS])
                        pointer = pointer[PROPS];
                    else {
                        pointer[PROPS] = tools.newCollection();
                        pointer[PROPS][PARENT] = pointer;
                        pointer = pointer[PROPS];
                    }
                }

                if (Object.hasOwnProperty.call (pointer, lastStep))
                    pointer = pointer[lastStep];
                else {
                    pointer = pointer[lastStep] = newNode (pointer[PARENT]);
                    pointer[LINE] = level.property.loc.start.line;
                    pointer[NAME] = [ nameDelimit, lastStep ];
                }

                // propagate silence
                if (silent)
                    pointer[SILENT] = true;
            }

            // gotta deref
            if (!shallow) {
                var cycle = [];
                while (
                    pointer[DEREF]
                 && pointer[DEREF].length === 1
                 && !pointer[TYPES].length
                 && cycle.indexOf (pointer[DEREF][0]) < 0
                )
                    cycle.push (pointer = pointer[DEREF][0]);
            }

            if (stowThis)
                pointer[THIS] = stowThis;

            return pointer;
        }

        function processComments (node, level, deadLine, pathParent) {
            // line in document
            if (node) {
                node[DOC] = fname;
                node[REFERER] = referer;
            }

            pathParent = pathParent && ( pathParent[THIS] || pathParent );

            // any documentation?
            // leading comments?
            var foundComment = false;
            if (level.leadingComments) {
                for (
                    var i=0,j=node ? level.leadingComments.length-1 : level.leadingComments.length;
                    i<j;
                    i++
                ) {
                    var comment = level.leadingComments[i];
                    if (deadLine && comment.loc.start.line <= deadLine)
                        continue;

                    var match;
                    Patterns.tag.lastIndex = 0;
                    if (
                        comment.type === 'Line'
                     || !(match = Patterns.tag.exec ('/*'+comment.value+'*/'))
                    )
                        continue;

                    // process tag comment
                    var ctype = match[1];
                    // valtypes
                    var valtype;
                    if (match[2])
                        valtype = Parser.parseType (match[2], fileScope);
                    else
                        valtype = [];
                    var pathstr = match[3];
                    var docstr = match[4] || '';
                    var pathfrags;
                    if (!pathstr)
                        pathfrags = baseNode[ROOT].concat();
                    else {
                        pathfrags = Parser.parsePath (pathstr, fileScope);
                        if (!pathfrags[0][0])
                            if (pathfrags.length === 1)
                                pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                            else
                                pathfrags[0][0] = '.';
                    }

                    if (ctype === 'module') {
                        tools.replaceElements (fileScope, pathfrags);
                        pathfrags = [];
                    }

                    Parser.parseTag (
                        context,
                        fname,
                        ctype,
                        valtype,
                        pathfrags,
                        fileScope,
                        defaultScope,
                        docstr,
                        next
                    );
                }

                // process final leading comment
                var comment = level.leadingComments[level.leadingComments.length-1];
                Patterns.tag.lastIndex = 0;
                if (comment.type !== 'Line' && comment.value[0] !== '!' && (
                    deadLine === undefined
                 || comment.loc.start.line > deadLine
                 || (level.loc.start.line === deadLine && comment.loc.start.line === deadLine)
                )) {
                    foundComment = true;
                    // javadoc comment?
                    if (comment.value.match (/^\*[^*]/)) {
                        if (node)
                            Parser.parseJavadocFlavorTag (
                                comment.value,
                                node,
                                baseNode[MODULE],
                                context.argv,
                                logger
                            );
                    } else {
                        // normal or doczar comment
                        if (!(match = Patterns.tag.exec ('/*'+comment.value+'*/'))) {
                            if (node) {
                                var modPortionMatch = comment.value.match (/^[ \t]*(@[^]*)/m);
                                if (modPortionMatch && modPortionMatch[1]) {
                                    var mods = [];
                                    Parser.consumeModifiers (
                                        fname,
                                        fileScope,
                                        [],
                                        function(){},
                                        modPortionMatch[1],
                                        mods
                                    );
                                    for (var i=0,j=mods.length; i<j; i++) {
                                        if (mods[i].mod === 'blind') {
                                            node[BLIND] = true;
                                            break;
                                        }
                                    }
                                }
                                node[DOCSTR] = [ comment.value ];
                                if (fileScope.length)
                                    node[OVERRIDE] = fileScope.concat();
                            }
                        } else {
                            // expression marked with a tag comment
                            var ctype = match[1];

                            // valtypes
                            var valtype;
                            if (match[2])
                                valtype = Parser.parseType (match[2], fileScope);
                            else
                                valtype = [];
                            var pathstr = match[3];
                            var docstr = match[4] || '';
                            var pathfrags;
                            var workingParent;
                            if (!pathstr) {
                                if (
                                    node
                                 && ctype !== 'spare'
                                 && ctype !== 'module'
                                 && NAME in node
                                ) {
                                    pathfrags = [];
                                    pathfrags.push (node[NAME].concat());
                                    workingParent = pathParent;
                                } else
                                    pathfrags = fileScope.length ? [] : baseNode[ROOT].concat();
                            } else {
                                pathfrags = Parser.parsePath (pathstr, []);
                                if (pathfrags[0][0])
                                    workingParent = pathParent;
                                else {
                                    if (pathfrags.length === 1)
                                        if (node && node[NAME]) {
                                            pathfrags[0][0] = node[NAME][0];
                                            workingParent = pathParent;
                                        } else
                                            pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                                    else
                                        pathfrags[0][0] = '.';
                                }
                            }

                            if (!ctype)
                                ctype = Patterns.delimiters[pathfrags[0][0]];

                            if (ctype === 'module') {
                                tools.replaceElements (fileScope, pathfrags);
                                pathfrags = [];
                            }

                            if (
                                !node
                              || ctype === 'spare'
                              || ctype === 'module'
                              || ctype === 'submodule'
                            ) {
                                // no related expression
                                Parser.parseTag (
                                    context,
                                    fname,
                                    ctype,
                                    valtype,
                                    pathfrags,
                                    fileScope,
                                    defaultScope,
                                    docstr,
                                    next
                                );
                            } else {
                                node[MOUNT] = {
                                    ctype:      ctype,
                                    path:       pathfrags,
                                    valtype:    valtype,
                                    docstr:     [ docstr ],
                                    docContext: fileScope.length ? fileScope.concat() : defaultScope.concat(),
                                    fname:      fname
                                };
                                if (workingParent)
                                    node[MOUNT].parent = workingParent;
                                node[OVERRIDE] = fileScope.length ?  fileScope.concat() : defaultScope.concat();
                                var mods = [];
                                Parser.consumeModifiers (
                                    fname,
                                    fileScope,
                                    [],
                                    function(){},
                                    docstr,
                                    mods
                                );
                                for (var i=0,j=mods.length; i<j; i++) {
                                    if (mods[i].mod === 'blind') {
                                        node[BLIND] = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (
                node
             && level.trailingComments
             && level.trailingComments[0].loc.start.line === level.loc.end.line
             && level.trailingComments[0].value[0] !== '!'
            ) {
                // use a trailing comment that starts on the same line as this statement ends on
                var trailer = level.trailingComments[0];
                // only use a line comment if no other DOCSTR has been found yet.
                if (trailer.type === 'Line') {
                    if (!node[DOCSTR])
                        node[DOCSTR] = [ trailer.value ];
                } else {
                    // try to parse it
                    Patterns.tag.lastIndex = 0;
                    if (!(match = Patterns.tag.exec ('/*'+trailer.value+'*/'))) {
                        var modPortionMatch = trailer.value.match (/^[ \t]*(@[^]*)/m);
                        if (modPortionMatch && modPortionMatch[1]) {
                            var mods = [];
                            Parser.consumeModifiers (
                                fname,
                                fileScope,
                                [],
                                function(){},
                                modPortionMatch[1],
                                mods
                            );
                            for (var i=0,j=mods.length; i<j; i++) {
                                if (mods[i].mod === 'blind') {
                                    node[BLIND] = true;
                                    break;
                                }
                            }
                        }
                        if (node[DOCSTR])
                            node[DOCSTR].push (trailer.value);
                        else
                            node[DOCSTR] = [ trailer.value ];
                        if (fileScope.length)
                            node[OVERRIDE] = fileScope.concat();
                    } else {
                        // expression marked with a tag comment
                        var ctype = match[1];
                        // valtypes
                        var valtype;
                        if (match[2])
                            valtype = Parser.parseType (match[2], fileScope);
                        else
                            valtype = [];
                        var pathstr = match[3];
                        var docstr = match[4] || '';
                        if (!pathstr) {
                            pathfrags = [];
                            if (
                                ctype !== 'spare'
                             && ctype !== 'module'
                             && NAME in node
                            ) {
                                pathfrags = [];
                                pathfrags.push (node[NAME].concat());
                                workingParent = pathParent;
                            } else
                                pathfrags = fileScope.length ? [] : baseNode[ROOT].concat();
                        } else {
                            pathfrags = Parser.parsePath (pathstr, []);
                            if (!pathfrags[0][0])
                                if (pathfrags.length === 1)
                                    pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                                else
                                    pathfrags[0][0] = '.';
                        }

                        if (ctype === 'module') {
                            tools.replaceElements (fileScope, pathfrags);
                            pathfrags = [];
                        }
                        if (ctype === 'spare' || ctype === 'module' || ctype === 'module') {
                            // no related expression
                            Parser.parseTag (
                                context,
                                fname,
                                ctype,
                                valtype,
                                pathfrags,
                                fileScope,
                                defaultScope,
                                docstr,
                                next
                            );
                        } else {
                            node[MOUNT] = {
                                ctype:      ctype,
                                path:       pathfrags,
                                valtype:    valtype,
                                docstr:     [ docstr ],
                                docContext: fileScope.length ? fileScope.concat() : defaultScope.concat(),
                                fname:      fname
                            };
                            node[OVERRIDE] = fileScope.length ?  fileScope.concat() : defaultScope.concat();
                            var mods = [];
                            Parser.consumeModifiers (
                                fname,
                                fileScope,
                                [],
                                function(){},
                                docstr,
                                mods
                            );
                            for (var i=0,j=mods.length; i<j; i++) {
                                if (mods[i].mod === 'blind') {
                                    node[BLIND] = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            if (node && fileScope.length && !node[OVERRIDE])
                node[OVERRIDE] = fileScope;
        }

        // ---------------------------------------------------------------- real processing begins
        // walk this level
        var node;
        switch (level.type) {
            case 'TryStatement':
                var moreBlocks = level.block.body;
                var localDeadLine = deadLine;
                for (var i=0,j=moreBlocks.length; i<j; i++) {
                    walkLevel (
                        moreBlocks[i],
                        scope,
                        thisNode,
                        localDeadLine,
                        scopeParent,
                        fnChain,
                        fileScope.concat()
                    );
                    localDeadLine = moreBlocks[i].loc.end.line;
                }
                break;
            case 'ReturnStatement':
                // add return type to node
                if (!scopeParent)
                    break;
                if (scopeParent[RETURNS])
                    node = scopeParent[RETURNS];
                else {
                    node = scopeParent[RETURNS] = newNode (scopeParent);
                    node[TRANSIENT] = true;
                }
                if (level.argument)
                    divineTypes (node, level.argument);
                break;
            case 'VariableDeclaration':
                // work each declaration
                for (var i=0,j=level.declarations.length; i<j; i++) {
                    var declaration = level.declarations[i];

                    // simple declaration?
                    if (!declaration.init)
                        break; // document it when it's found being used

                    // self pointer?
                    if (declaration.init.type === 'ThisExpression') {
                        var selfPointer = thisNode || newNode (scope);
                        if (!selfPointer[MEMBERS]) {
                            selfPointer[MEMBERS] = tools.newCollection();
                            selfPointer[MEMBERS][PARENT] = selfPointer;
                        }
                        node = scope[declaration.id.name] = newNode (scope);
                        node[NAME] = [ '.', declaration.id.name ];
                        node[DEREF].push (selfPointer[MEMBERS]);
                        continue;
                    }

                    if (Object.hasOwnProperty.call (scope, declaration.id.name))
                        node = scope[declaration.id.name];
                    else {
                        node = scope[declaration.id.name] = newNode (scope);
                        node[NAME] = [ '.', declaration.id.name ];
                        node[LINE] = declaration.loc.start.line;
                    }

                    // divine the type being set
                    divineTypes (node, declaration.init);
                }
                break;
            case 'ExpressionStatement':
                switch (level.expression.type) {
                    case 'AssignmentExpression':
                        if (level.expression.right.type === 'ThisExpression') {
                            // either a self pointer, or set this-type to a prop/member
                            if (level.expression.left.type === 'Identifier') {
                                // simple self pointer
                                var selfPointer = thisNode || newNode (scope);
                                if (!selfPointer[MEMBERS]) {
                                    selfPointer[MEMBERS] = tools.newCollection();
                                    selfPointer[MEMBERS][PARENT] = selfPointer;
                                }
                                node = scope[level.expression.left.name] = newNode (scope);
                                node[NAME] = [ '.', level.expression.left.name ];
                                node[DEREF].push (selfPointer[MEMBERS]);
                                node = selfPointer;
                            } else {
                                // set `this` into a prop somewhere
                            }
                            break;
                        }

                        node = getNode (scope, level.expression.left);
                        if (!node)
                            break;
                        if (node[NO_SET])
                            break;
                        if (!node[IS_COL]) {
                            // divine the type being set
                            divineTypes (node, level.expression.right);
                            break;
                        }
                        // something like Foo.prototype = {
                        divineTypes (node, level.expression.right, node[PARENT]);
                        node = node[PARENT];
                        break;
                    case 'CallExpression':
                        var doProcess = langPack.trip (
                            'CallExpression',
                            context,
                            baseNode,
                            fname,
                            referer,
                            level.expression,
                            newNode,
                            next
                        );
                        if (doProcess)
                            processCallExpression (level.expression);
                        break;
                    case 'UnaryExpression':
                        // nothing to do here
                        break;
                    case 'UpdateExpression':
                        // target must be a Number, at least sometimes
                        node = getNode (scope, level.expression.argument);
                        if (!node)
                            break;
                        if (node[TYPES].indexOf ('Number') < 0)
                            node[TYPES].push ('Number');
                        break;
                    case 'LogicalExpression':
                        // step into both terms
                        walkLevel (
                            level.expression.left,
                            scope,
                            thisNode,
                            deadLine,
                            scopeParent,
                            fnChain,
                            fileScope.concat()
                        );
                        var localDeadLine = deadLine;
                        if (level.expression.left.loc.end.line != level.expression.right.loc.start.line)
                            localDeadLine = level.expression.left.loc.end.line;
                        walkLevel (
                            level.expression.right,
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            fnChain,
                            fileScope.concat()
                        );
                        break;
                    case 'ConditionalExpression':
                        // step into all three terms
                        walkLevel (
                            level.expression.test,
                            scope,
                            thisNode,
                            deadLine,
                            scopeParent,
                            fnChain,
                            fileScope.concat()
                        );
                        var localDeadLine = deadLine;
                        if (level.expression.test.loc.end.line != level.expression.consequent.loc.start.line)
                            localDeadLine = level.expression.test.loc.end.line;
                        walkLevel (
                            level.expression.consequent,
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            fnChain,
                            fileScope.concat()
                        );
                        if (level.expression.consequent.loc.end.line != level.expression.alternate.loc.start.line)
                            localDeadLine = level.expression.consequent.loc.end.line;
                        walkLevel (
                            level.expression.alternate,
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            fnChain,
                            fileScope.concat()
                        );
                        break;
                    case 'NewExpression':
                        // get the type of the item instantiated
                        var typeNode = getNode (scope, level.expression.callee);
                        if (!typeNode)
                            return;
                        var chain = [ typeNode ];
                        while (
                            typeNode[DEREF].length === 1
                         && chain.indexOf (typeNode[DEREF][0]) < 0
                        )
                            chain.push (typeNode = typeNode[DEREF][0]);
                        // apply argument info to constructor
                        var args;
                        if (typeNode[ARGUMENTS])
                            args = typeNode[ARGUMENTS];
                        else
                            args = typeNode[ARGUMENTS] = [];
                        for (var i=0,j=level.expression.arguments.length; i<j; i++) {
                            var arg;
                            if (i < args.length)
                                arg = args[i];
                            else {
                                arg = args[i] = newNode (typeNode);
                                arg[NO_SET] = true;
                                arg[NAME] = [ '(', '' ];
                            }
                            divineTypes (arg, level.expression.arguments[i]);
                            if (typeNode[SILENT])
                                arg[SILENT] = true;
                        }
                    default:
                        logger.trace (
                            { type:level.expression.type, line:level.loc.start.line },
                            'unknown expression type'
                        );
                        break;
                }
                break;
            case 'ConditionalExpression':
                // step into all three terms
                walkLevel (
                    level.test,
                    scope,
                    thisNode,
                    deadLine,
                    scopeParent,
                    fnChain,
                    fileScope.concat()
                );
                var localDeadLine = deadLine;
                if (level.test.loc.end.line != level.consequent.loc.start.line)
                    localDeadLine = level.test.loc.end.line;
                walkLevel (
                    level.consequent,
                    scope,
                    thisNode,
                    localDeadLine,
                    scopeParent,
                    fnChain,
                    fileScope.concat()
                );
                if (level.consequent.loc.end.line != level.alternate.loc.start.line)
                    localDeadLine = level.consequent.loc.end.line;
                walkLevel (
                    level.alternate,
                    scope,
                    thisNode,
                    localDeadLine,
                    scopeParent,
                    fnChain,
                    fileScope.concat()
                );
                break;
            case 'FunctionDeclaration':
                if (!level.id)
                    break;
                node = getNode (scope, level.id);
                if (!node)
                    break;
                if (node[TYPES].indexOf ('Function') < 0)
                    node[TYPES].push ('Function');
                var args;
                if (node[ARGUMENTS])
                    args = node[ARGUMENTS];
                else
                    args = node[ARGUMENTS] = [];

                // work argument types for the function
                var lastI = args.length-1;
                var localDeadLine = deadLine;
                var lastArg;
                for (var i=0,j=level.params.length; i<j; i++) {
                    var param = level.params[i];
                    if (i < args.length)
                        args[i][NAME] = [ '(', param.name ];
                    else {
                        var arg = args[i] = newNode (node);
                        arg[NAME] = [ '(', param.name ];
                        arg[TYPES] = [];
                        arg[DEREF] = [];
                        arg[NO_SET] = true;
                    }
                    divineTypes (param, args[i]);
                    processComments (args[i], param, localDeadLine, node);
                    if (
                        lastArg
                     && level.params[i].loc.start.line !== localDeadLine
                     && level.params[i].leadingComments
                     && level.params[i].leadingComments[0].loc.start.line === localDeadLine
                    )
                        processComments (lastArg, {
                            loc:                level.params[i-1].loc,
                            trailingComments:   [ level.params[i].leadingComments[0] ]
                        });
                    lastArg = args[i];
                    localDeadLine = param.loc.end.line;
                }

                // recurse into function body
                if (node[TYPES].indexOf ('Function') < 0)
                    node[TYPES].push ('Function');
                var innerScope = new filth.SafeMap (scope);
                for (var i=0,j=args.length; i<j; i++) {
                    var arg = args[i];
                    innerScope[arg[NAME][1]] = arg;
                }
                node[SCOPE] = innerScope;
                var localDeadLine = deadLine;
                node[BODY] = level.body.body;
                node[THIS] = node;
                var current;
                hoistNames (innerScope, level.body.body);
                if (fnChain.length < context.argv.maxDepth && fnChain.indexOf (node) < 0) {
                    var localChain = fnChain.concat();
                    localChain.push (node);
                    for (var i=0,j=level.body.body.length; i<j; i++) {
                        walkLevel (
                            level.body.body[i],
                            innerScope,
                            node,
                            localDeadLine,
                            node,
                            localChain,
                            fileScope.concat()
                        );
                        localDeadLine = level.body.body[i].loc.end.line;
                    }
                    // run any waiting call tests
                    if (node[WAITING_CALLS]) {
                        var waitingCalls = node[WAITING_CALLS];
                        delete node[WAITING_CALLS];
                        for (var i=0,j=waitingCalls.length; i<j; i++) {
                            waitingCalls[i] (node[BODY]);
                        }
                    }
                }
                if (!node[REBASE])
                    node[REBASE] = function (base) {
                        // var item = newNode (node[PARENT], node);
                        item = filth.circularClone (node, undefined, cloneShallowFilter);
                        delete item[MEMBERS];
                        var innerScope = new filth.SafeMap (scope, node[SCOPE]);
                        for (var i=0,j=node[BODY].length; i<j; i++) {
                            walkLevel (
                                node[BODY][i],
                                innerScope,
                                base,
                                localDeadLine,
                                node,
                                localChain,
                                fileScope.concat()
                            );
                            localDeadLine = node[BODY][i].loc.end.line;
                        }
                        return item;
                    };
                break;
            case 'IfStatement':
                // perform a dummy type check on the test
                // recurses to walk any assignment statements
                divineTypes (newNode (baseNode), level.test);

                // walk the consequent
                if (level.consequent.type != 'BlockStatement')
                    walkLevel (
                        level.consequent,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        fnChain,
                        fileScope.concat()
                    );
                else {
                    var localDeadLine = deadLine;
                    for (var i=0,j=level.consequent.body.length; i<j; i++) {
                        walkLevel (
                            level.consequent.body[i],
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            fnChain,
                            fileScope.concat()
                        );
                        localDeadLine = level.consequent.body[i].loc.end.line;
                    }
                }

                // walk the alternate
                if (level.alternate)
                    if (level.alternate.type != 'BlockStatement')
                        walkLevel (
                            level.alternate,
                            scope,
                            thisNode,
                            deadLine,
                            scopeParent,
                            fnChain,
                            fileScope.concat()
                        );
                    else {
                        var localDeadLine = deadLine;
                        for (var i=0,j=level.alternate.body.length; i<j; i++) {
                            walkLevel (
                                level.alternate.body[i],
                                scope,
                                thisNode,
                                localDeadLine,
                                scopeParent,
                                fnChain,
                                fileScope.concat()
                            );
                            localDeadLine = level.alternate.body[i].loc.end.line;
                        }
                    }
                break;
            case 'ForStatement':
                // register anything relevant in the init, test and update
                if (level.init)
                    walkLevel (
                        level.init,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        fnChain,
                        fileScope.concat()
                    );
                if (level.test)
                    walkLevel (
                        level.test,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        fnChain,
                        fileScope.concat()
                    );
                if (level.update)
                    walkLevel (
                        level.update,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        fnChain,
                        fileScope.concat()
                    );

                // walk the body
                if (level.body.type != 'BlockStatement')
                    walkLevel (
                        level.body,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        fnChain,
                        fileScope.concat()
                    );
                else {
                    var localDeadLine = deadLine;
                    for (var i=0,j=level.body.body.length; i<j; i++) {
                        walkLevel (
                            level.body.body[i],
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            fnChain,
                            fileScope.concat()
                        );
                        localDeadLine = level.body.body[i].loc.end.line;
                    }
                }
                break;
            case 'ForOfStatement':
            case 'ForInStatement':
                // register the iterated term into the scope
                try {
                    var iteratedNode = getNode (level.left.declarations[0]);
                } catch (err) {
                    logger.trace ({
                        type:       level.type,
                        line:       level.loc.start.line,
                        iterator:   level.left,
                        iterating:  level.right
                    }, 'malformed for loop');
                    break;
                }

                // walk the body
                if (level.body.type != 'BlockStatement')
                    walkLevel (
                        level.body,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        fnChain,
                        fileScope.concat()
                    );
                else {
                    var localDeadLine = deadLine;
                    for (var i=0,j=level.body.body.length; i<j; i++) {
                        walkLevel (
                            level.body.body[i],
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            fnChain,
                            fileScope.concat()
                        );
                        localDeadLine = level.body.body[i].loc.end.line;
                    }
                }
                break;
            case 'WhileStatement':
            case 'DoWhileStatement':
                // perform a dummy type check on the test
                // recurses to walk any assignment statements
                divineTypes (newNode (baseNode), level.test);

                // walk the body
                if (level.body.type != 'BlockStatement')
                    walkLevel (
                        level.body,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        fnChain,
                        fileScope.concat()
                    );
                else {
                    var localDeadLine = deadLine;
                    for (var i=0,j=level.body.body.length; i<j; i++) {
                        walkLevel (
                            level.body.body[i],
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            fnChain,
                            fileScope.concat()
                        );
                        localDeadLine = level.body.body[i].loc.end.line;
                    }
                }
                break;
            case 'ExportDefaultDeclaration':
                var targetNode = baseNode[pathLib.parse (fname).name];

                if (!level.declaration)
                    break;

                node = walkLevel (
                    level.declaration,
                    scope,
                    thisNode,
                    deadLine,
                    scopeParent,
                    fnChain,
                    fileScope.concat()
                );

                break;
            case 'ExportNamedDeclaration':
                // step into declaration
                if (!scope[EXPORTS])
                    scope[EXPORTS] = newNode (scope);
                if (!level.declaration)
                    break;

                node = walkLevel (
                    level.declaration,
                    scope,
                    thisNode,
                    deadLine,
                    scopeParent,
                    fnChain,
                    fileScope.concat()
                );

                break;
            case 'ImportDeclaration':
                // already hoisted
                break;
            case 'ClassDeclaration':
                var className = level.id.name;
                if (Object.hasOwnProperty.call (scope, className))
                    node = scope[className];
                else {
                    node = scope[className] = newNode (scope);
                    node[LINE] = level.loc.start.line;
                }
                if (node[TYPES] && node[TYPES].indexOf ('Function') < 0)
                    node[TYPES].push ('Function');

                var innerScope = filth.SafeMap (scope);

                if (level.superClass) {
                    var superNode = getNode (scope, level.superClass);
                    if (superNode) {
                        innerScope['super'] = superNode;
                        if (node[SUPER])
                            node[SUPER].push (superNode);
                        else
                            node[SUPER] = [ superNode ];
                    }
                }
                if (!node[MEMBERS]) {
                    node[MEMBERS] = tools.newCollection();
                    node[MEMBERS][PARENT] = node;
                }
                var members = node[MEMBERS];
                for (var i=0,j=level.body.body.length; i<j; i++) {
                    var declaration = level.body.body[i];
                    walkLevel (
                        declaration,
                        innerScope,
                        node,
                        declaration.loc.end.line,
                        scope,
                        fnChain,
                        fileScope.concat()
                    );
                }
                break;
            case 'MethodDefinition':
                if (level.key.name === 'constructor')
                    node = thisNode;
                else if (Object.hasOwnProperty.call (thisNode[MEMBERS], level.key.name))
                    node = thisNode[MEMBERS][level.key.name];
                else {
                    node = thisNode[MEMBERS][level.key.name] = newNode (thisNode);
                    node[LINE] = level.loc.start.line;
                }
                divineTypes (node, level.value);
                break;
            case 'EmptyStatement':
                break;
            case 'Identifier':
                break;
            case 'SwitchStatement':
                break;
            case 'ThrowStatement':
                if (!scopeParent)
                    break;
                if (scopeParent[THROWS])
                    node = scopeParent[THROWS];
                else
                    node = scopeParent[THROWS] = newNode (scopeParent);
                divineTypes (node, level.argument);
                break;
            case 'BreakStatement':
                // nothing to do here
                break;
            case 'LogicalExpression':
                // step into both terms
                walkLevel (
                    level.left,
                    scope,
                    thisNode,
                    deadLine,
                    scopeParent,
                    fnChain,
                    fileScope.concat()
                );
                var localDeadLine = deadLine;
                if (level.left.loc.end.line != level.right.loc.start.line)
                    localDeadLine = level.left.loc.end.line;
                walkLevel (
                    level.right,
                    scope,
                    thisNode,
                    localDeadLine,
                    scopeParent,
                    fnChain,
                    fileScope.concat()
                );
                break;
            case 'CallExpression':
                processCallExpression (level);
                break;
            default:
                // unknown statement type
                logger.trace (
                    { type:level.type, line:level.loc.start.line },
                    'unknown statement type'
                );
                break;
        }

        // comments time!
        processComments (node, level, deadLine, scopeParent);
        return node;
    }

    // hoist ES6 import and export-as statements
    for (var i=0,j=tree.body.length; i<j; i++) {
        var level = tree.body[i];
        switch (level.type) {
            case 'ImportDeclaration':
                var importName = level.source.value[0] === '/' ?
                    pathLib.resolve (context.argv.fileRoot, importName.slice (1))
                  : level.source.value.slice (0, 2) === './' ?
                        level.source.value
                      : './' + level.source.value
                      ;
                var pathInfo = langPack.getDependency (
                    context,
                    pathLib.resolve (process.cwd(), referer),
                    fname,
                    baseNode[MODULE],
                    importName
                );
                // if there's no path info, an error occured and was logged
                if (!pathInfo)
                    break;
                var moduleNode = langPack.getRoot (context, pathInfo.file, pathInfo.root, pathInfo.path);
                next (pathInfo.file, pathInfo.referer || referer);

                // first check if it's `import * as ModName from "foo.js"`
                if (level.specifiers[0].type === "ImportNamespaceSpecifier") {
                    var localNode;
                    if (Object.hasOwnProperty.call (baseNode, level.specifiers[0].local.name))
                        localNode = baseNode[level.specifiers[0].local.name];
                    else
                        localNode = baseNode[level.specifiers[0].local.name] = newNode (baseNode);
                    localNode[DEREF].push (moduleNode[EXPORTS]);
                    localNode[ALIAS] = moduleNode[EXPORTS];
                } else // iterate import specifiers
                    for (var k=0,l=level.specifiers.length; k<l; k++) {
                        var spec = level.specifiers[k];
                        var foreign;
                        var source = spec.imported || spec.local;
                        if (Object.hasOwnProperty.call (
                            moduleNode[EXPORTS][PROPS],
                            source.name
                        ))
                            foreign = moduleNode[EXPORTS][PROPS][source.name];
                        else
                            foreign
                             = moduleNode[EXPORTS][PROPS][source.name]
                             = newNode (moduleNode)
                             ;
                        var localNode;
                        if (Object.hasOwnProperty.call (baseNode, spec.local.name))
                            localNode = baseNode[spec.local.name];
                        else
                            localNode = baseNode[spec.local.name] = newNode (baseNode);
                        localNode[DEREF].push (foreign);
                        localNode[ALIAS] = foreign;
                    }
                break;
            case 'ExportDefaultDeclaration':
                if (!baseNode[EXPORTS][PROPS])
                    baseNode[EXPORTS][PROPS] = tools.newCollection();
                var defaultName = pathLib.parse (fname).name;
                if (Object.hasOwnProperty.call (baseNode[EXPORTS][PROPS], defaultName))
                    node = baseNode[EXPORTS][PROPS][defaultName];
                else
                    node = baseNode[EXPORTS][PROPS][defaultName] = newNode (baseNode);
                if (level.declaration.id) // place in the local scope
                    baseNode[level.declaration.id.name] = node;
                break;
            case 'ExportNamedDeclaration':
                if (!level.specifiers)
                    break;
                for (var k=0,l=level.specifiers.length; k<l; k++) {
                    var spec = level.specifiers[k];
                    if (Object.hasOwnProperty.call (
                        baseNode[EXPORTS][PROPS],
                        spec.exported.name
                    ))
                        node
                         = baseNode[spec.local.name]
                         = baseNode[EXPORTS][PROPS][spec.exported.name]
                         ;
                    else
                        node
                         = baseNode[spec.local.name]
                         = baseNode[EXPORTS][PROPS][spec.exported.name]
                         = newNode (baseNode)
                         ;
                }
                if (level.specifiers.length !== 1)
                    node = undefined;
                break;
        }
    }

    // push any pre-configured ES6 exports into the scope to be picked up later
    if (baseNode[EXPORTS]) for (var name in baseNode[EXPORTS][PROPS]) {
        var specimen = baseNode[EXPORTS][PROPS][name];
        if (specimen[LOCAL_NAME])
            continue;
        specimen[LOCAL_NAME] = name;
        baseNode[name] = specimen;
    }

    // hoist the body's names
    hoistNames (baseNode, tree.body);

    // normal body processing
    var fileScope = [];
    for (var i=0,j=tree.body.length; i<j; i++) {
        walkLevel (
            tree.body[i],
            baseNode,
            undefined,
            i ? tree.body[i-1].loc.end.line : 0,
            undefined,
            [ tree.body[i] ],
            fileScope
        );
    }

    // handle tag comments after the last expression
    if (tree.body.length) {
        var lastWord = tree.body[tree.body.length-1];
        if (!lastWord.trailingComments)
            return;
        var bottomLine = lastWord.loc.end.line;
        for (var i=0,j=lastWord.trailingComments.length; i<j; i++) {
            var comment = lastWord.trailingComments[i];
            if (comment.loc.start.line <= bottomLine)
                continue;
            var match;
            Patterns.tag.lastIndex = 0;
            if (
                comment.type === 'Line'
             || !(match = Patterns.tag.exec ('/*'+comment.value+'*/'))
            )
                continue;

            // process tag comment
            var ctype = match[1];
            // valtypes
            var valtype;
            if (match[2])
                valtype = Parser.parseType (match[2], fileScope);
            else
                valtype = [];
            var pathstr = match[3];
            var docstr = match[4] || '';
            var pathfrags;
            if (!pathstr)
                pathfrags = fileScope.length ? [] : baseNode[ROOT].concat();
            else {
                pathfrags = Parser.parsePath (pathstr, []);
                if (!pathfrags[0][0])
                    if (pathfrags.length === 1)
                        pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                    else
                        pathfrags[0][0] = '.';
            }

            if (ctype === 'module') {
                fileScope = pathfrags.concat();
                pathfrags = [];
            }

            Parser.parseTag (
                context,
                fname,
                ctype,
                valtype,
                pathfrags,
                fileScope,
                defaultScope,
                docstr,
                next
            );
        }
        return;
    }

    // handle files with comments only
    if (!tree.leadingComments)
        return;
    for (var i=0,j=tree.leadingComments.length; i<j; i++) {
        var comment = tree.leadingComments[i];
        if (comment.type != 'Block')
            continue;

        Patterns.tag.lastIndex = 0;
        if (!(match = Patterns.tag.exec ('/*' + comment.value + '*/')))
            continue;

        // process documentation tag comment
        var ctype = match[1];
        // valtypes
        var valtype;
        if (match[2])
            valtype = Parser.parseType (match[2], fileScope);
        else
            valtype = [];
        var pathstr = match[3];
        var docstr = match[4] || '';
        var pathfrags;
        if (!pathstr)
            pathfrags = fileScope.length ? [] : baseNode[ROOT].concat();
        else {
            pathfrags = Parser.parsePath (pathstr, []);
            if (!pathfrags[0][0])
                if (pathfrags.length === 1)
                    pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                else
                    pathfrags[0][0] = '.';
        }

        if (ctype === 'module') {
            fileScope = pathfrags.concat();
            pathfrags = [];
        }

        Parser.parseTag (
            context,
            fname,
            ctype,
            valtype,
            pathfrags,
            fileScope,
            defaultScope,
            docstr,
            next
        );
    }
}


/*
    Prepares the syntax tree produced by [processSyntaxFile](.processSyntaxFile) by collapsing all
    information relevant to the future Components into individual representative Nodes.
     * Gather documentation from the DEREF tree of each Node
     * propagate NAME and BLIND
     * set ALIAS when a MOUNT is encountered
@argument:doczar.ComponentCache context
@argument:doczar/src/langs/LangPack langPack
@argument:doczar.Parser/Path defaultScope
*/
function preprocessSyntaxTree (context, langPack, defaultScope) {
    function compressCollection (collection) {
        var didWrite = false;
        function mergeNodes (target, source) {
            var didWrite = false;
            if (source[MEMBERS])
                if (!target[MEMBERS]) {
                    didWrite = true;
                    target[MEMBERS] = tools.newCollection (source[MEMBERS])
                    target[MEMBERS][PARENT] = target;
                } else for (var name in source[MEMBERS])
                    if (Object.hasOwnProperty.call (target[MEMBERS], name))
                        didWrite += mergeNodes (
                            target[MEMBERS][name],
                            source[MEMBERS][name]
                        );
                    else {
                        didWrite = true;
                        target[MEMBERS][name] = source[MEMBERS][name];
                    }
            if (source[PROPS])
                if (!target[PROPS]) {
                    didWrite = true;
                    target[PROPS] = tools.newCollection (source[PROPS])
                    target[PROPS][PARENT] = target;
                } else for (var name in source[PROPS]) {
                    if (Object.hasOwnProperty.call (target[PROPS], name))
                        didWrite += mergeNodes (
                            target[PROPS][name],
                            source[PROPS][name]
                        );
                    else {
                        didWrite = true;
                        target[PROPS][name] = source[PROPS][name];
                    }
                }
            if (source[THROWS]) {
                if (!target[THROWS]) {
                    didWrite = true;
                    target[THROWS] = tools.newNode();
                } else
                    didWrite += mergeNodes (target[THROWS], source[THROWS]);
            }
            if (source[ARGUMENTS]) {
                if (!target[ARGUMENTS]) {
                    didWrite = true;
                    target[ARGUMENTS] = source[ARGUMENTS].concat();
                } else {
                    var targetArgs = target[ARGUMENTS].length;
                    for (var i=0,j=source[ARGUMENTS].length; i<j; i++)
                        if (i < targetArgs)
                            didWrite += mergeNodes (
                                target[ARGUMENTS][i],
                                source[ARGUMENTS][i]
                            );
                        else {
                            didWrite = true;
                            target[ARGUMENTS][i] = source[ARGUMENTS][i];
                        }
                }
            }
            if (source[RETURNS])
                if (target[RETURNS])
                    didWrite += mergeNodes (target[RETURNS], source[RETURNS]);
                else {
                    didWrite = true;
                    target[RETURNS] = source[RETURNS];
                }
            return didWrite;
        }

        // rebases functions as methods
        function rebase (item) {
            // recurse to rebase methods housed on DEREF
            preprocessDerefs (item);

            if (item[REBASE])
                return item[REBASE] (collection[PARENT]);
            return tools.newNode (item);
        }

        for (var i=0,j=collection[DEREF].length; i<j; i++) {
            var sourceNode = collection[DEREF][i];
            didWrite += preprocessDerefs (sourceNode);

            // copy the sourceNode's props into the members collection
            // and rebase any methods onto the new class
            if (sourceNode[IS_COL])
                for (var key in sourceNode) {
                    var item = rebase (sourceNode[key]);
                    didWrite += preprocessDerefs (item);
                    if (Object.hasOwnProperty.call (collection, key))
                        didWrite += mergeNodes (collection[key], item);
                    else {
                        didWrite = true;
                        collection[key] = item;
                    }
                }
            if (sourceNode[PROPS])
                for (var key in sourceNode[PROPS]) {
                    var item = rebase (sourceNode[PROPS][key]);
                    if (Object.hasOwnProperty.call (collection, key))
                        didWrite += mergeNodes (collection[key], item);
                    else {
                        didWrite = true;
                        collection[key] = item;
                    }
                    if (collection[key][NAME])
                        collection[key][NAME][0] = '#';
                    else
                        collection[key][NAME] = [ '#', key ];
                }
            if (sourceNode[MEMBERS])
                for (var key in sourceNode[MEMBERS]) {
                    var item = rebase (sourceNode[MEMBERS][key]);
                    if (Object.hasOwnProperty.call (collection, key))
                        didWrite += mergeNodes (collection[key], item);
                    else {
                        didWrite = true;
                        collection[key] = item;
                    }
                }
        }

        return didWrite;
    }

    function preprocessDerefs (level, target, chain, isTransient) {
        var didFinishDeref = false;
        if (!target)
            target = level;
        if (!chain)
            chain = [ target ];
        if (target[TRANSIENT])
            isTransient = true;

        function recurse (level, target) {
            if (chain.length >= context.argv.maxRefDepth)
                return false;
            // if (IS_COL in level)
            //     return false;
            if (chain.indexOf (level) >= 0)
                return false;
            var newChain = chain.concat();
            newChain.push (level);
            return preprocessDerefs (level, target || level, newChain, isTransient);
        }

        if (level[NAME] && level[NAME][1] && (!target[NAME] || !target[NAME][1]))
            target[NAME] = level[NAME];
        else if (level[MOUNT] && level[MOUNT].path && level[MOUNT].path.length)
            target[NAME] = level[MOUNT].path[level[MOUNT].path.length-1].concat();

        if (level[BLIND])
            target[BLIND] = true;

        // if (!level[DEREF])
        //     return false;

        // dive for LINE definitions
        if (target === level && !target[LINE] && !isTransient) {
            var pointer = level;
            var lineChain = [ level ];
            while (
                !pointer[LINE]
             && pointer[DEREF]
             && pointer[DEREF].length === 1
             && !pointer[DEREF][0][TRANSIENT]
            ) {
                pointer = pointer[DEREF][0];
                if (pointer[LINE])
                    break;
                if (lineChain.indexOf (pointer) >= 0)
                    break;
                lineChain.push (pointer);
            }
            if (pointer[LINE])
                target[LINE] = pointer[LINE];
        }

        for (var i=0,j=level[DEREF].length; i<j; i++) {
            var ref = level[DEREF][i];
            if (chain.indexOf (ref) >= 0)
                continue;
            if (IS_COL in ref)
                continue;
            recurse (ref, target);

            // alias to mount
            if (ref[MOUNT] && !isTransient && ref[MOUNT].path) {
                target[ALIAS] = ref;
                recurse (ref);
            }

            // basic types
            var baseTypes = ref[TYPES];
            for (var k=0,l=baseTypes.length; k<l; k++)
                if (target[TYPES].indexOf (baseTypes[k]) < 0) {
                    target[TYPES].push (baseTypes[k]);
                    didFinishDeref = true;
                }
            if (ref[INSTANCE]) {
                var classes = ref[INSTANCE];
                if (!target[INSTANCE]) {
                    target[INSTANCE] = classes.concat();
                    didFinishDeref = true;
                } else for (var k=0,l=classes.length; k<l; k++)
                    if (target[INSTANCE].indexOf (classes[k]) < 0) {
                        target[INSTANCE].push (classes[k]);
                        didFinishDeref = true;
                    }
            }
            // promote documentation
            if (ref[DOCSTR]) {
                if (!target[DOCSTR]) {
                    target[DOCSTR] = ref[DOCSTR].concat();
                    didFinishDeref = true;
                } else for (var i=0,j=ref[DOCSTR].length; i<j; i++)
                    if (target[DOCSTR].indexOf (ref[DOCSTR][i]) < 0) {
                        target[DOCSTR].push (ref[DOCSTR][i]);
                        didFinishDeref = true;
                    }
            }
            // promot REBASE function
            if (ref[REBASE])
                target[REBASE] = ref[REBASE];
            // promote function body
            if (ref[BODY] && !target[BODY])
                target[BODY] = ref[BODY];
            // promote children
            if (ref[PROPS]) {
                if (!target[PROPS]) {
                    target[PROPS] = tools.newCollection (target[PROPS]);
                    target[PROPS][PARENT] = target;
                } else for (var name in ref[PROPS])
                    if (!Object.hasOwnProperty.call (target[PROPS], name))
                        target[PROPS][name] = ref[PROPS][name];
                    else
                        recurse (ref[PROPS][name], target[PROPS][name]);
            }
            if (ref[MEMBERS]) {
                if (!target[MEMBERS]) {
                    target[MEMBERS] = tools.newCollection (ref[MEMBERS]);
                    target[MEMBERS][PARENT] = target;
                } else for (var name in ref[MEMBERS])
                    if (!Object.hasOwnProperty.call (target[MEMBERS], name))
                        target[MEMBERS][name] = ref[MEMBERS][name];
                    else
                        recurse (ref[MEMBERS][name], target[MEMBERS][name]);
            }
            if (ref[ARGUMENTS]) {
                if (!target[ARGUMENTS])
                    target[ARGUMENTS] = ref[ARGUMENTS].concat();
                else for (var i=0,j=ref[ARGUMENTS].length; i<j; i++) {
                    var refArg = ref[ARGUMENTS][i];
                    if (target[ARGUMENTS].indexOf (refArg) >= 0)
                        continue;
                    var found = false;
                    if (i < target[ARGUMENTS].length) {
                        found = true;
                        didFinishDeref += recurse (refArg, target[ARGUMENTS][i])
                    }

                    if (!found) {
                        // add to arguments
                        if (i < target[ARGUMENTS].length)
                            didFinishDeref += recurse (refArg, target[ARGUMENTS][i]);
                        else {
                            target[ARGUMENTS].push (refArg);
                            didFinishDeref = true;
                        }
                    }
                }
            }
            if (ref[RETURNS]) {
                if (!target[RETURNS])
                    target[RETURNS] = ref[RETURNS];
                else
                    recurse (ref[RETURNS], target[RETURNS]);
            }
            if (ref[THROWS]) {
                if (!target[THROWS])
                    target[THROWS] = ref[THROWS];
                else
                    recurse (ref[THROWS], target[THROWS]);
            }

            if (ref[BODY] && !target[BODY]) {
                didFinishDeref = true;
                target[BODY] = ref[BODY];
            }
        }

        // recurse
        if (level[ARGUMENTS]) for (var i=0,j=level[ARGUMENTS].length; i<j; i++)
            didFinishDeref += recurse (level[ARGUMENTS][i]);
        if (level[RETURNS])
            didFinishDeref += recurse (level[RETURNS]);

        if (typeof level !== 'object')
            throw new Error ('unexpected error');

        for (var key in level)
            didFinishDeref += recurse (level[key], undefined);

        // if (target[NO_SET])
        //     return didFinishDeref;

        if (level[MEMBERS]) {
            if (level[MEMBERS][DEREF].length)
                didFinishDeref += compressCollection (level[MEMBERS]);
            for (var key in level[MEMBERS]) {
                var nextTarget = level[MEMBERS][key];
                didFinishDeref += recurse (nextTarget, nextTarget);
            }
        }

        if (level[PROPS]) {
            if (level[PROPS][DEREF].length)
                didFinishDeref += compressCollection (level[PROPS]);
            for (var key in level[PROPS]) {
                var nextTarget = level[PROPS][key];
                didFinishDeref += recurse (nextTarget, nextTarget);
            }
        }

        if (target[WAITING_CALLS] && target[BODY]) {
            didFinishDeref = true;
            var waitingCalls = target[WAITING_CALLS];
            delete target[WAITING_CALLS];
            for (var i=0,j=waitingCalls.length; i<j; i++)
                waitingCalls[i] (target[BODY]);
        }

        return didFinishDeref;
    }

    // clean up roots
    var globalNode = langPack.cleanupGlobal (context);
    for (var rootPath in context.sources) {
        var sourceRoot = context.sources[rootPath];
        for (var key in globalNode)
            if (sourceRoot[key] === globalNode[key])
                delete sourceRoot[key];
    }
    langPack.cleanupRoot (context.sources);

    // preprocess syntax tree
    var finishedADeref;
    var round = 1;
    do {
        finishedADeref = false;
        for (var rootPath in context.sources) {
            context.logger.setTask (
                'preprocessing syntax tree (round '
              + round
              + ') '
              + pathLib.relative (process.cwd(), rootPath)
            );
            var sourceRoot = context.sources[rootPath];
            delete sourceRoot.globals;
            for (var key in sourceRoot) try {
                var target = sourceRoot[key];
                finishedADeref += preprocessDerefs (target, target, [ target ]);
            } catch (err) {
                context.logger.error (
                    { err:err, path:rootPath, parse:context.argv.parse },
                    'failed to preprocess syntax tree'
                );
            }
        }
        for (var key in globalNode) try {
            var target = globalNode[key];
            finishedADeref += preprocessDerefs (target, target, [ target ]);
        } catch (err) {
            context.logger.error (
                { err:err, path:rootPath, parse:context.argv.parse },
                'failed to preprocess syntax tree'
            );
        }
        round++;
    } while (finishedADeref);
}


module.exports = {
    processSyntaxFile:      processSyntaxFile,
    preprocessSyntaxTree:   preprocessSyntaxTree
};
