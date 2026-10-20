import InterfaceIcon from '@/components/common/InterfaceIcon';
import { Link } from 'react-router-dom';
import '@/pages/public/PublicExperience.css';
import './HomeHero.css';
import { usePublicEasterEggs } from '@/components/public/easterEggs/context';

export default function HomeHero() {
  const { openTyping, tapSpotlight } = usePublicEasterEggs();
  return (
    <section className="home-launch" aria-labelledby="home-launch-title">
      <div className="home-launch-aurora" aria-hidden="true" />
      <div className="experience-container">
        <div className="home-launch-heading">
          <p>ZERONE ONLINE JUDGE</p>
          <h1 id="home-launch-title">당신의 다음 프로그래밍 플랫폼</h1>
          <p className="home-launch-description">
            문제 출제 · 코드 제출 · 자동 채점 · 스코어보드
          </p>
        </div>
        <div className="home-universe">
          <div className="home-universe-halo" aria-hidden="true" />
          <div className="home-orbit home-orbit-one" aria-hidden="true">
            <i />
          </div>
          <div className="home-orbit home-orbit-two" aria-hidden="true">
            <i />
          </div>
          <div className="home-monogram">
            Z<span>O</span>J<span className="home-monogram-dot">.</span>
          </div>
          <button
            type="button"
            className="home-satellite is-code home-egg-trigger"
            onClick={(event) =>
              openTyping(event.currentTarget.getBoundingClientRect())
            }
            aria-label="예제 코드"
          >
            <span>
              <InterfaceIcon name="code" />
            </span>
            <span className="home-satellite-copy">
              <small>C++17</small>
              <strong>int main() {'{ return 0; }'}</strong>
            </span>
          </button>
          <div className="home-satellite is-result">
            <span>
              <InterfaceIcon name="check" />
            </span>
            <div>
              <small>판정 예시</small>
              <strong>Accepted</strong>
            </div>
          </div>
          <span className="home-star is-first" aria-hidden="true">
            <InterfaceIcon name="asterisk" />
          </span>
          <button
            type="button"
            className="home-star is-second home-egg-trigger"
            aria-label="별"
            onClick={(event) =>
              tapSpotlight({ x: event.clientX, y: event.clientY })
            }
          >
            <InterfaceIcon name="sparkle" />
          </button>
          <span className="home-universe-coordinate" aria-hidden="true">
            ZERONE
            <br />
            ONLINE JUDGE
          </span>
        </div>
        <div className="home-launch-bottom">
          <div className="home-launch-actions">
            <Link to="/about" className="home-about-link">
              ZOJ 알아보기{' '}
              <span aria-hidden="true">
                <InterfaceIcon name="arrowUpRight" />
              </span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
