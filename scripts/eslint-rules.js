export const localPlugin = {
  rules: {
    comments: {
      meta: {
        type: 'suggestion',
        schema: [],
        messages: {
          noComments: 'Comments are allowed only as JSDoc on the exported API of a package.',
          onlyPublicJsdoc: 'Only JSDoc right before an exported declaration or a member of an exported type is allowed.',
          missingJsdoc: 'Exported declarations need a JSDoc comment.',
        },
      },
      create: checkComments,
    },
  },
};

const DIRECTIVE = /^\s*(eslint-|eslint\s|@ts-|globals?\s|\/\s*<reference)/;
const PACKAGE_SOURCE = /(^|\/)(libs|adapters|apps|packs)\/[^/]+\/src\//;
const TEST_SOURCE = /(\/tests\/|\.test\.ts$)/;

function checkComments(context) {
  const { sourceCode } = context;
  const filename = context.filename.replaceAll('\\', '/');
  const isPublicSource = PACKAGE_SOURCE.test(filename) && !TEST_SOURCE.test(filename);

  return {
    Program(program) {
      const allowed = isPublicSource ? collectPublicJsdoc(context, program) : new Set();

      for (const comment of sourceCode.getAllComments()) {
        if (comment.type === 'Shebang' || DIRECTIVE.test(comment.value) || allowed.has(comment)) continue;

        context.report({ loc: comment.loc, messageId: isPublicSource ? 'onlyPublicJsdoc' : 'noComments' });
      }
    },
  };
}

function collectPublicJsdoc(context, program) {
  const allowed = new Set();

  for (const statement of program.body) {
    if (statement.type !== 'ExportNamedDeclaration' || statement.declaration === null) continue;

    const doc = jsdocBefore(context.sourceCode, statement);

    if (doc === undefined) {
      context.report({ node: statement, messageId: 'missingJsdoc' });
    } else {
      allowed.add(doc);
    }

    for (const member of documentableMembers(statement.declaration)) {
      const memberDoc = jsdocBefore(context.sourceCode, member);

      if (memberDoc !== undefined) allowed.add(memberDoc);
    }
  }

  return allowed;
}

function jsdocBefore(sourceCode, node) {
  const comment = sourceCode.getCommentsBefore(node).at(-1);

  return comment?.type === 'Block' && comment.value.startsWith('*') ? comment : undefined;
}

function documentableMembers(declaration) {
  if (declaration.type === 'TSInterfaceDeclaration') return declaration.body.body;

  if (declaration.type === 'TSTypeAliasDeclaration' && declaration.typeAnnotation.type === 'TSTypeLiteral') {
    return declaration.typeAnnotation.members;
  }

  return [];
}
