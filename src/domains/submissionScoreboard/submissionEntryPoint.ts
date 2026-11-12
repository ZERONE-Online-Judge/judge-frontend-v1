import type { JudgeLanguage } from '@/domains/submissionScoreboard/types';

export type SubmissionEntryPointCheck = {
  language: 'java8' | 'kotlin';
  filename: string;
  launchCommand: string;
  issues: { code: string; title: string; description: string }[];
  example: string;
};

type Token = { value: string; depth: number; close?: number };

// This is a conservative source inspection, not a compiler. In particular,
// comments and literals must never supply a class, package, or main method.
function tokenize(source: string, kotlin: boolean): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let depth = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index++;
    } else if (
      source.startsWith('//', index) ||
      (index === 0 && source.startsWith('#!', index))
    ) {
      const end = source.indexOf('\n', index);
      index = end < 0 ? source.length : end + 1;
    } else if (source.startsWith('/*', index)) {
      index += 2;
      let nesting = 1;
      while (index < source.length && nesting) {
        if (kotlin && source.startsWith('/*', index)) {
          nesting++;
          index += 2;
        } else if (source.startsWith('*/', index)) {
          nesting--;
          index += 2;
        } else index++;
      }
    } else if (source.startsWith('"""', index)) {
      const end = source.indexOf('"""', index + 3);
      index = end < 0 ? source.length : end + 3;
      tokens.push({ value: '$literal', depth });
    } else if (char === '"' || char === "'") {
      index++;
      while (index < source.length) {
        if (source[index] === '\\') index += 2;
        else if (source[index++] === char) break;
      }
      tokens.push({ value: '$literal', depth });
    } else if (kotlin && char === '`') {
      const end = source.indexOf('`', index + 1);
      tokens.push({
        value: end < 0 ? '$unknown' : source.slice(index + 1, end),
        depth,
      });
      index = end < 0 ? source.length : end + 1;
    } else if (/[\p{L}_$]/u.test(char)) {
      const start = index++;
      while (index < source.length && /[\p{L}\p{N}_$]/u.test(source[index]))
        index++;
      tokens.push({ value: source.slice(start, index), depth });
    } else {
      if (char === '}') depth = Math.max(0, depth - 1);
      tokens.push({ value: char, depth });
      if (char === '{') depth++;
      index++;
    }
  }
  const parentheses: number[] = [];
  tokens.forEach((token, tokenIndex) => {
    if (token.value === '(') parentheses.push(tokenIndex);
    else if (token.value === ')') {
      const open = parentheses.pop();
      if (open !== undefined) tokens[open].close = tokenIndex;
    }
  });
  return tokens;
}

function precedingDeclaration(tokens: Token[], index: number): string[] {
  const depth = tokens[index].depth;
  let start = index - 1;
  // Bound lookbehind even for malformed or adversarial source text.
  while (start >= 0 && index - start <= 256) {
    const token = tokens[start];
    if (
      token.depth < depth ||
      (token.depth === depth && [';', '{', '}'].includes(token.value))
    )
      break;
    start--;
  }
  return tokens.slice(start + 1, index).map((token) => token.value);
}

function closingParen(tokens: Token[], open: number): number {
  return tokens[open]?.close ?? -1;
}

function javaIssues(tokens: Token[]): SubmissionEntryPointCheck['issues'] {
  const issues: SubmissionEntryPointCheck['issues'] = [];
  if (tokens.some((token) => token.depth === 0 && token.value === 'package'))
    issues.push({
      code: 'java-package',
      title: 'package 선언을 확인하세요',
      description:
        '채점기는 기본 패키지의 Main을 실행합니다. package 선언이 있으면 실행할 Main을 찾지 못하므로 선언을 제거하세요.',
    });

  const types = tokens.flatMap((token, index) =>
    token.depth === 0 && ['class', 'interface', 'enum'].includes(token.value)
      ? [{ index, name: tokens[index + 1]?.value }]
      : [],
  );
  const otherPublicTypes = types.filter(
    ({ index, name }) =>
      name !== 'Main' && precedingDeclaration(tokens, index).includes('public'),
  );
  if (otherPublicTypes.length)
    issues.push({
      code: 'java-public-type',
      title: 'public 클래스 이름과 저장 파일명이 다릅니다',
      description: `이 코드는 Main.java로 저장됩니다. 최상위 public 타입 ${otherPublicTypes.map(({ name }) => name).join(', ')}의 이름을 Main으로 맞추거나, 보조 타입이라면 public을 제거하세요.`,
    });
  const mainType = types.find(({ name }) => name === 'Main');
  if (!mainType) {
    issues.push({
      code: 'java-main-type',
      title: '실행할 Main 타입을 확인하지 못했습니다',
      description:
        '기본 패키지에 Main 클래스를 선언하고 그 안에 public static void main(String[] args)을 작성하세요. Main 클래스 자체는 public이 아니어도 됩니다.',
    });
    return issues;
  }

  let bodyStart = mainType.index + 2;
  while (bodyStart < tokens.length && tokens[bodyStart].value !== '{')
    bodyStart++;
  let hasMain = false;
  for (let index = bodyStart + 1; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.depth === 0) break;
    if (
      token.depth !== 1 ||
      token.value !== 'main' ||
      tokens[index + 1]?.value !== '('
    )
      continue;
    const modifiers = precedingDeclaration(tokens, index);
    const close = closingParen(tokens, index + 1);
    if (close < 0) continue;
    const parameter = tokens
      .slice(index + 2, close)
      .map(({ value }) => value)
      .join('')
      .replace(/^final/, '');
    if (
      modifiers.includes('public') &&
      modifiers.includes('static') &&
      modifiers.at(-1) === 'void' &&
      /^(?:java\.lang\.)?String(?:\[\]|\.\.\.)[\p{L}_$][\p{L}\p{N}_$]*$/u.test(
        parameter,
      )
    )
      hasMain = true;
    if (
      modifiers.includes('public') &&
      modifiers.includes('static') &&
      modifiers.at(-1) === 'void' &&
      /^(?:java\.lang\.)?String[\p{L}_$][\p{L}\p{N}_$]*\[\]$/u.test(parameter)
    )
      hasMain = true;
  }
  if (!hasMain)
    issues.push({
      code: 'java-main-method',
      title: 'main 메서드 형식을 확인하세요',
      description:
        'Main 안에서 public static void main(String[] args)을 확인하지 못했습니다. public·static·void와 String 배열 인자를 확인하세요. 상속한 main 등은 자동 확인이 어려우므로 직접 확인한 뒤 제출할 수 있습니다.',
    });
  return issues;
}

function kotlinIssues(tokens: Token[]): SubmissionEntryPointCheck['issues'] {
  const owners: { kind: string; id: number }[] = [];
  const candidates = new Set<number>();
  let inferredReturn = false;
  let renamedMain = false;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.value === '{') {
      const declaration = precedingDeclaration(tokens, index);
      owners.push({
        id: index,
        kind: declaration.includes('fun')
          ? 'function'
          : declaration.includes('object')
            ? 'object'
            : 'other',
      });
    } else if (token.value === '}') owners.pop();
    if (
      token.value !== 'fun' ||
      tokens[index + 1]?.value !== 'main' ||
      tokens[index + 2]?.value !== '('
    )
      continue;
    const prefix = precedingDeclaration(tokens, index);
    const declarationBoundary = Math.max(
      ...['val', 'var', 'fun', 'class', 'object', 'typealias'].map((keyword) =>
        prefix.lastIndexOf(keyword),
      ),
    );
    const annotations = prefix.slice(declarationBoundary + 1);
    const hasJvmStatic = annotations.some(
      (value, annotationIndex) =>
        value === '@' &&
        (annotations[annotationIndex + 1] === 'JvmStatic' ||
          annotations
            .slice(annotationIndex + 1, annotationIndex + 6)
            .join('') === 'kotlin.jvm.JvmStatic'),
    );
    const topLevel = token.depth === 0;
    const staticObject = owners.at(-1)?.kind === 'object' && hasJvmStatic;
    if (!topLevel && !staticObject) continue;
    if (
      annotations.some(
        (value, annotationIndex) =>
          value === '@' &&
          (annotations[annotationIndex + 1] === 'JvmName' ||
            annotations
              .slice(annotationIndex + 1, annotationIndex + 6)
              .join('') === 'kotlin.jvm.JvmName'),
      )
    )
      renamedMain = true;
    const close = closingParen(tokens, index + 2);
    if (close < 0) continue;
    const parameter = tokens
      .slice(index + 3, close)
      .map(({ value }) => value)
      .join('');
    const stringType = '(?:kotlin\\.)?String';
    const name = '[\\p{L}_$][\\p{L}\\p{N}_$]*';
    const arrayArgument = new RegExp(
      `^${name}:(?:kotlin\\.)?Array<(?:out)?${stringType}>[,]?$`,
      'u',
    ).test(parameter);
    const varargArgument = new RegExp(
      `^vararg${name}:${stringType}[,]?$`,
      'u',
    ).test(parameter);
    if (!(topLevel && parameter === '') && !arrayArgument && !varargArgument)
      continue;
    // Explicit non-Unit results cannot be JVM entry points. Expression bodies
    // can infer Unit; that requires a compiler, so leave them advisory only.
    if (tokens[close + 1]?.value === ':') {
      let end = close + 2;
      while (
        end < tokens.length &&
        end - close <= 256 &&
        !['{', '=', ';'].includes(tokens[end].value)
      )
        end++;
      const result = tokens
        .slice(close + 2, end)
        .map(({ value }) => value)
        .join('');
      if (!['Unit', 'kotlin.Unit'].includes(result)) continue;
    } else if (tokens[close + 1]?.value === '=') {
      inferredReturn = true;
    }
    // The no-arg and args overload in the same file belong to one facade.
    candidates.add(topLevel ? -1 : (owners.at(-1)?.id ?? -1));
  }
  if (!candidates.size)
    return [
      {
        code: 'kotlin-main',
        title: 'JAR에서 실행할 main 함수를 확인하지 못했습니다',
        description:
          '일반적으로 파일 최상위에 fun main() 또는 fun main(args: Array<String>)을 작성합니다. 클래스의 일반 멤버 함수는 진입점이 아닙니다. object·companion 방식은 @JvmStatic main(args: Array<String>)인지 확인하세요. 반환형은 Unit이어야 합니다.',
      },
    ];
  if (candidates.size > 1)
    return [
      {
        code: 'kotlin-multiple-main',
        title: '여러 main 함수가 JAR 진입점 후보입니다',
        description:
          '여러 클래스에 실행 가능한 main이 있으면 JAR의 시작점을 선택하지 못할 수 있습니다. 실제로 실행할 진입점 하나만 남기는지 확인하세요.',
      },
    ];
  if (renamedMain)
    return [
      {
        code: 'kotlin-renamed-main',
        title: 'main 함수의 JVM 이름을 확인하세요',
        description:
          'main 함수에 붙인 @JvmName이 실행 메서드를 다른 이름으로 바꾸면 JAR을 시작할 수 없습니다. 함수의 애너테이션을 제거하거나 JVM 이름이 main인지 확인하세요. 파일에 붙이는 @file:JvmName은 사용할 수 있습니다.',
      },
    ];
  if (inferredReturn)
    return [
      {
        code: 'kotlin-inferred-return',
        title: '식 본문 main의 반환형을 확인하세요',
        description:
          'fun main() = ... 형식은 식의 결과에 따라 반환형이 달라집니다. Unit을 반환하는지 확인하거나 fun main() { ... } 형식으로 작성하세요. Unit인 식 본문은 그대로 제출할 수 있습니다.',
      },
    ];
  return [];
}

export function inspectSubmissionEntryPoint(
  language: JudgeLanguage,
  sourceCode: string,
): SubmissionEntryPointCheck | null {
  if (language !== 'java8' && language !== 'kotlin') return null;
  const java = language === 'java8';
  return {
    language,
    filename: java ? 'Main.java' : 'Main.kt',
    launchCommand: java
      ? 'java -cp <채점 작업 폴더> Main'
      : 'java -jar program.jar',
    issues: java
      ? javaIssues(tokenize(sourceCode, false))
      : kotlinIssues(tokenize(sourceCode, true)),
    example: java
      ? 'public class Main {\n    public static void main(String[] args) {\n        // 풀이 코드\n    }\n}'
      : 'fun main() {\n    // 풀이 코드\n}',
  };
}
