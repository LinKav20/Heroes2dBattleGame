export const localPlugin = {
  rules: {
    comments: {
      meta: {
        type: 'suggestion',
        schema: [],
        messages: {
          noComments: 'Comments are allowed only as JSDoc on the exported API of a package.',
          onlyPublicJsdoc: 'Only JSDoc right before an exported declaration or its member is allowed.',
          missingJsdoc: 'Exported declarations need a JSDoc comment.',
        },
      },
      create: checkComments,
    },
    'file-names': {
      meta: {
        type: 'suggestion',
        schema: [],
        messages: {
          kebabCase: 'File names are lower case words joined by hyphens, for example hex-grid.ts.',
          testsFolder: 'Tests live in a tests folder next to the code they test.',
        },
      },
      create: checkFileName,
    },
  },
};

const LINE_DIRECTIVE = /^\s*(eslint-disable-line|eslint-disable-next-line|@ts-(expect-error|ignore|nocheck|check))\b/;
const BLOCK_DIRECTIVE = /^\s*(eslint|eslint-disable|eslint-enable|globals?|exported)\s/;
const TRIPLE_SLASH_DIRECTIVE = /^\/\s*<reference\s/;
const COVERAGE_DIRECTIVE = /^\s*(v8|c8|istanbul)\s+ignore\b/;
const PACKAGE_SOURCE = /(^|\/)(libs|adapters|apps|packs)\/[^/]+\/src\//;
const TEST_SOURCE = /(\/tests\/|\.test\.ts$)/;
const KEBAB_CASE = /^\.?[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+)*$/;

function checkComments(context) {
  const { sourceCode } = context;
  const filename = context.filename.replaceAll('\\', '/');
  const isPublicSource = PACKAGE_SOURCE.test(filename) && !TEST_SOURCE.test(filename);

  return {
    Program(program) {
      const allowed = isPublicSource ? collectPublicJsdoc(context, program) : new Set();

      for (const comment of sourceCode.getAllComments()) {
        if (comment.type === 'Shebang' || isDirective(comment) || allowed.has(comment)) continue;

        context.report({ loc: comment.loc, messageId: isPublicSource ? 'onlyPublicJsdoc' : 'noComments' });
      }
    },
  };
}

function checkFileName(context) {
  const path = context.filename.replaceAll('\\', '/');
  const name = path.slice(path.lastIndexOf('/') + 1);

  return {
    Program(program) {
      if (!KEBAB_CASE.test(name)) context.report({ node: program, messageId: 'kebabCase' });

      if (name.endsWith('.test.ts') && !path.includes('/tests/')) {
        context.report({ node: program, messageId: 'testsFolder' });
      }
    },
  };
}

function isDirective(comment) {
  if (COVERAGE_DIRECTIVE.test(comment.value)) return true;
  if (comment.type === 'Block') return BLOCK_DIRECTIVE.test(comment.value);

  return LINE_DIRECTIVE.test(comment.value) || TRIPLE_SLASH_DIRECTIVE.test(comment.value);
}

function collectPublicJsdoc(context, program) {
  const allowed = new Set();
  let previous;

  for (const statement of program.body) {
    const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : null;

    if (declaration !== null) {
      const doc = jsdocBefore(context.sourceCode, statement);

      if (doc !== undefined) {
        allowed.add(doc);
      } else if (!continuesOverload(previous, declaration)) {
        context.report({ node: statement, messageId: 'missingJsdoc' });
      }

      for (const member of documentableMembers(declaration)) {
        const memberDoc = jsdocBefore(context.sourceCode, member);

        if (memberDoc !== undefined) allowed.add(memberDoc);
      }
    }

    previous = declaration;
  }

  return allowed;
}

function continuesOverload(previous, declaration) {
  return previous?.type === 'TSDeclareFunction'
    && /^(TSDeclareFunction|FunctionDeclaration)$/.test(declaration.type)
    && previous.id?.name === declaration.id?.name;
}

function jsdocBefore(sourceCode, node) {
  const comment = sourceCode.getCommentsBefore(node).at(-1);

  return comment?.type === 'Block' && comment.value.startsWith('*') ? comment : undefined;
}

function documentableMembers(declaration) {
  switch (declaration.type) {
    case 'TSInterfaceDeclaration':
      return declaration.body.body.flatMap(withNestedMembers);
    case 'TSTypeAliasDeclaration':
      return typeMembers(declaration.typeAnnotation);
    case 'TSEnumDeclaration':
      return declaration.body?.members ?? declaration.members;
    case 'ClassDeclaration':
      return declaration.body.body.filter((member) => !isPrivateMember(member));
    default:
      return [];
  }
}

function withNestedMembers(member) {
  return [member, ...typeMembers(member.typeAnnotation?.typeAnnotation)];
}

function typeMembers(type) {
  switch (type?.type) {
    case 'TSTypeLiteral':
      return type.members.flatMap(withNestedMembers);
    case 'TSIntersectionType':
    case 'TSUnionType':
      return type.types.flatMap(typeMembers);
    default:
      return [];
  }
}

function isPrivateMember(member) {
  return member.accessibility === 'private' || member.key?.type === 'PrivateIdentifier';
}
