
/**     @module doczar.Templates
    Loads and prepares the Marked and Handlebars renderers. Encapsulates a state mechanism to root
    links to the [Component](doczar.Component) being rendered.
*/

var path = require ('path');
var fs = require ('fs');
var url = require ('url');
var marked = require ('marked');
var Handlebars = require ('handlebars');
var highlight = require ('highlight.js');
var Patterns = require ('./Patterns');

var currentContext;
var currentPath;
var currentLinkContext;
var currentOptions = {};

function concatArrs () {
    var out = [];
    for (var i in arguments)
        if (arguments[i])
            out.push.apply (out, arguments[i]);
    return out;
}

var markedRenderer = new marked.Renderer();
markedRenderer.link = function (href, title, text) {
    var targetStr = href || text;

    var target = url.parse (targetStr);
    if (target.protocol == 'http:' || target.protocol == 'https:')
        return '<a href="'+href+'">' + ( text || href ) + '</a>'

    if (!target.protocol) {
        // typelink
        var uglypath = '';
        for (var i in currentLinkContext)
            uglypath += (currentLinkContext[i][0] || '.') + currentLinkContext[i][1];

        if (targetStr == '.')
            type = currentLinkContext;
        else {
            var type = [];
            var typeMatch;
            while (typeMatch = Patterns.word.exec (targetStr))
                type.push ([ typeMatch[1], typeMatch[2] ]);
            if (type[0][0])
                type = concatArrs (currentLinkContext, type);
        }

        var notFound;
        try {
            currentContext.resolve (type);
        } catch (err) {
            currentContext.warnings.push ({
                context:    uglypath,
                reference:  targetStr,
                warning:    'failed to create cross-reference'
            });
        }

        return '<a href="'
         + currentContext.getRelativeURLForType (
            currentPath,
            type
         )
         + '"><code>'
         + ( text || uglypath )
         + '</code></a>'
         ;
    }

    return href;
};
marked.setOptions ({
    gfm:        true,
    renderer:   markedRenderer,
    highlight:  function (code, lang) {
        if (lang)
            return highlight.highlightAuto (code, [ lang ]).value;
        return highlight.highlightAuto (code).value;
    }
});

// load partials
var partialsPath = path.resolve (path.dirname (module.filename), '../templates');
var partials = {};
var pnames = fs.readdirSync (partialsPath);
for (var i in pnames) {
    var currentTemplateName = pnames[i];
    if (currentTemplateName[0] == '.' || currentTemplateName.slice (-5) != '.bars')
        continue;
    Handlebars.registerPartial (
        currentTemplateName.slice (0, -5),
        fs.readFileSync (path.join (partialsPath, currentTemplateName)).toString ('utf8')
    );
}

Handlebars.registerHelper ('markdown', function (doc) {
    var out = '';
    for (var i in doc) {
        var frag = doc[i];
        currentLinkContext = frag.context;
        out += marked (frag.doc);
    }
    return out;
});

Handlebars.registerHelper ('link', function (tpath) {
    var link = currentContext.getRelativeURLForType (
        currentPath,
        tpath
    );
    return link;
});

Handlebars.registerHelper ('softlink', function (tpath) {
    try {
        var component = currentContext.resolve (tpath);
        return '#' + component.final.elemID;
    } catch (err) {
        // not found
        return 'javascript:return false;'
    }
});

var ComponentTemplate = Handlebars.compile (
    '{{> header}}\n'
  + '{{> children}}\n'
  + '{{> footer}}\n'
);

var RootTemplate = Handlebars.compile (
    fs.readFileSync (
        path.join (
            path.resolve (
                path.dirname (module.filename),
                '../'
            ),
            'templates',
            'root.bars'
        )
    ).toString ('utf8')
);

function render (component, options) {
    currentContext = component.context;
    currentPath = component.path;
    currentOptions = options;
    return ComponentTemplate (component.final);
};

function renderRoot (root, context, options) {
    currentContext = context;
    currentPath = [];
    currentOptions = options;

    var modules = [];
    var props = [];
    for (var key in root.property)
        if (root.property[key].ctype == 'module')
            modules.push (root.property[key].final);
        else
            props.push (root.property[key].final);

    return RootTemplate ({
        modules:        modules,
        properties:     props
    });
};

module.exports = {
    render:         render,
    renderRoot:     renderRoot
};
