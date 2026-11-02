import { ExperienceReveal } from '@/components/common/PublicExperience';

const languages = [
  {
    name: 'C99',
    version: 'GCC 14.2.0',
    execution: 'C99 표준 · -std=c99 · -O2 최적화',
  },
  {
    name: 'C++17',
    version: 'G++ 14.2.0',
    execution: 'C++17 표준 · -std=c++17 · -O2 최적화',
  },
  {
    name: 'Python 3.11',
    version: 'CPython 3.11.17',
    execution: '문법 검사 후 CPython으로 실행',
  },
  {
    name: 'PyPy 3.11',
    version: 'PyPy 8.0.1 · Python 3.11.17 호환',
    execution: '문법 검사 후 PyPy로 실행',
  },
  {
    name: 'Java 8 호환',
    version: 'Temurin OpenJDK 21.0.12.1+1 LTS',
    execution: 'javac --release 8로 컴파일 · JDK 21에서 실행',
  },
  {
    name: 'Kotlin',
    version: 'Kotlin/JVM 1.9.24',
    execution: 'Temurin OpenJDK 21.0.12.1+1 LTS에서 실행',
  },
];

export default function JudgeLanguageReference() {
  return (
    <section
      className="experience-container experience-section"
      id="judge-languages"
    >
      <ExperienceReveal>
        <div className="experience-section-heading">
          <div>
            <p className="experience-eyebrow">SUPPORTED LANGUAGES</p>
            <h2>지원 언어와 버전</h2>
          </div>
          <p>제출할 코드의 컴파일·실행 환경을 확인하세요.</p>
        </div>
        <div
          className="zoj-horizontal-scroll"
          role="region"
          aria-label="지원 언어와 버전 표"
          tabIndex={0}
        >
          <table className="judge-language-table">
            <caption className="sr-only">새 제출에 지원하는 6가지 언어</caption>
            <thead>
              <tr>
                <th scope="col">언어</th>
                <th scope="col">컴파일러·런타임 버전</th>
                <th scope="col">컴파일 및 실행 방식</th>
              </tr>
            </thead>
            <tbody>
              {languages.map((language) => (
                <tr key={language.name}>
                  <th scope="row">{language.name}</th>
                  <td>{language.version}</td>
                  <td>{language.execution}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="judge-section-footnote">
          문제마다 허용 언어가 다를 수 있어요. 실제 제출 화면에서 선택 가능한
          언어를 확인하세요. Python 3.13은 기존 제출의 기록·재채점용으로
          유지하며, 새 Python 제출은 3.11을 사용합니다.
        </p>
      </ExperienceReveal>
    </section>
  );
}
