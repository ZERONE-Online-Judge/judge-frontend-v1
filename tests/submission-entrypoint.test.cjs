const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const file = path.resolve(
  __dirname,
  '../src/domains/submissionScoreboard/submissionEntryPoint.ts',
);
const loaded = new Module(file, module);
loaded._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  file,
);
const inspect = loaded.exports.inspectSubmissionEntryPoint;
const codes = (language, source) =>
  inspect(language, source).issues.map(({ code }) => code);
const main = (method) => `class Main { ${method} }`;

test('only languages with the deployed JVM filename contract opt in', () => {
  for (const language of ['c99', 'cpp17', 'python311', 'python313', 'pypy3'])
    assert.equal(inspect(language, 'anything'), null);
  assert.equal(inspect('java8', '').filename, 'Main.java');
  assert.match(inspect('java8', '').launchCommand, / Main$/);
  assert.equal(inspect('kotlin', '').filename, 'Main.kt');
  assert.equal(inspect('kotlin', '').launchCommand, 'java -jar program.jar');
});

test('ordinary Java signatures accepted by the real compiler remain accepted', () => {
  for (const method of [
    'public static void main(String[] args) {}',
    'static public void main(String args[]) throws Exception {}',
    'public static void main(java.lang.String[] args) {}',
    'public static void main(final String... args) {}',
    'public static synchronized void main(String [] 인자) {}',
  ])
    assert.deepEqual(codes('java8', main(method)), [], method);
  for (const kind of ['class', 'interface', 'enum'])
    assert.deepEqual(
      codes(
        'java8',
        `public ${kind} Main { ${kind === 'enum' ? ';' : ''} public static void main(String[] args) {} }`,
      ),
      [],
      kind,
    );
});

test('Java public type filename mismatch and package each explain the fix', () => {
  assert.deepEqual(
    codes(
      'java8',
      'package contest; public class Solution { public static void main(String[] args) {} }',
    ),
    ['java-package', 'java-public-type'],
  );
  assert.deepEqual(
    codes(
      'java8',
      'public class Main { public static void main(String[] a) {} public class Nested {} } class Helper {}',
    ),
    [],
  );
});

test('Java launch failures warn about the entry method', () => {
  for (const method of [
    'static void main(String[] args) {}',
    'public void main(String[] args) {}',
    'public static int main(String[] args) {return 0;}',
    'public static void main() {}',
    'public static void Main(String[] args) {}',
    'public static void main(int[] args) {}',
    'public static void main(String[][] args) {}',
    'class Nested {public static void main(String[] args) {}}',
  ])
    assert.deepEqual(
      codes('java8', main(method)),
      ['java-main-method'],
      method,
    );
});

test('Java comments, strings and helper types cannot impersonate the entry', () => {
  assert.deepEqual(
    codes(
      'java8',
      'class Main { /* public static void main(String[] args) {} */ String s="public static void main(String[] args) {}"; } class Helper { public static void main(String[] args) {} }',
    ),
    ['java-main-method'],
  );
  assert.deepEqual(
    codes(
      'java8',
      '// package fake; public class Wrong {}\nclass Main { String s="\\\" package fake;"; public static void main(String[] args) {} }',
    ),
    [],
  );
});

test('unrecognized inherited or Unicode Java forms remain advisory', () => {
  const result = inspect(
    'java8',
    'class Base { public static void main(String[] a) {} } class Main extends Base {}',
  );
  assert.deepEqual(
    result.issues.map(({ code }) => code),
    ['java-main-method'],
  );
  assert.match(result.issues[0].description, /상속한 main.*직접 확인/);
  assert.ok(codes('java8', 'class M\\u0061in {}').includes('java-main-type'));
});

test('Kotlin valid JAR entries do not require MainKt, Main or no package', () => {
  for (const source of [
    'fun main() { println(1) }',
    'fun main(args: Array<String>) {}',
    'package contest\nfun main() {}',
    '@file:JvmName("Solution")\nfun main() {}',
    'suspend fun main() {}',
    'private fun main() {}',
    'fun main(args: kotlin.Array<kotlin.String>): kotlin.Unit {}',
    'fun main() {}\nfun main(args: Array<String>) {}',
    'object Solution { @JvmStatic fun main(args: Array<String>) {} }',
    'object Solution { @kotlin.jvm.JvmStatic fun main(args: Array<String>) {} }',
    'class Solution { companion object { @JvmStatic fun main(args: Array<String>) {} } }',
    'fun `main`() {}',
  ])
    assert.deepEqual(codes('kotlin', source), [], source);
});

test('Kotlin instance methods, wrong arguments and return types warn', () => {
  for (const source of [
    'class Main { fun main(args: Array<String>) {} }',
    'object Main { fun main(args: Array<String>) {} }',
    'fun main(args: String) {}',
    'fun main(): Int {return 0}',
    'fun helper() { fun main() {} }',
    'object Main { @JvmStatic val version = 1\n fun main(args: Array<String>) {} }',
    'object Main { val JvmStatic = 1\n fun main(args: Array<String>) {} }',
  ])
    assert.deepEqual(codes('kotlin', source), ['kotlin-main'], source);
});

test('Kotlin ambiguous JAR entries warn but same facade overloads do not', () => {
  for (const source of [
    'fun main() {} object Other { @JvmStatic fun main(args: Array<String>) {} }',
    'object A { @JvmStatic fun main(args: Array<String>) {} } object B { @JvmStatic fun main(args: Array<String>) {} }',
  ])
    assert.deepEqual(codes('kotlin', source), ['kotlin-multiple-main']);
});

test('Kotlin nested comments and literal text cannot supply main', () => {
  assert.deepEqual(
    codes(
      'kotlin',
      '/* /* nested */ fun main() {} */ val text = """fun main() {}""" // fun main() {}',
    ),
    ['kotlin-main'],
  );
  assert.deepEqual(
    codes('kotlin', 'fun main() { val s = "\\\" fun wrong() {}" }'),
    [],
  );
});

test('Kotlin inferred results request a check instead of promising a JAR entry', () => {
  for (const source of ['fun main() = 42', 'fun main() = println(1)'])
    assert.deepEqual(codes('kotlin', source), ['kotlin-inferred-return']);
  assert.deepEqual(codes('kotlin', 'fun main(): Unit = println(1)'), []);
});

test('Kotlin function JVM rename warns while file facade rename stays valid', () => {
  assert.deepEqual(codes('kotlin', '@JvmName("other") fun main() {}'), [
    'kotlin-renamed-main',
  ]);
  assert.deepEqual(
    codes('kotlin', '@file:JvmName("other")\nfun main() {}'),
    [],
  );
});

test('large malformed source remains bounded and returns actionable warnings', () => {
  const started = performance.now();
  const java = inspect('java8', 'class Main {' + 'void main('.repeat(20_000));
  const kotlin = inspect('kotlin', 'fun main('.repeat(20_000));
  assert.ok(java.issues.length);
  assert.ok(kotlin.issues.length);
  assert.ok(performance.now() - started < 5000);
});

test('Java filename guidance explains Main once without a duplicate missing-class warning', () => {
  const result = inspect(
    'java8',
    'public class Solution { public static void main(String[] args) {} }',
  );
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ['java-public-type'],
  );
  assert.match(result.issues[0].title, /Main.java/);
  assert.match(result.issues[0].description, /Solution.*Main/);
  assert.deepEqual(codes('java8', 'class Solution {}'), ['java-main-type']);
});
