import InterfaceIcon from '@/components/common/InterfaceIcon';
import { Link } from 'react-router-dom';
import '@/pages/public/PublicExperience.css';
import './HomeHero.css';
import HomeSecrets from './HomeSecrets';
import { useHomeSecrets } from './useHomeSecrets';

export default function HomeHero() {
  const { secret, tap, close } = useHomeSecrets();
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
            Z<span>O</span>J
            <button
              type="button"
              className="home-monogram-dot home-secret-trigger"
              aria-label="ZOJ 마침표"
              onClick={() => tap('binary')}
            >
              .
            </button>
          </div>
          <button
            type="button"
            className="home-satellite is-code home-secret-trigger"
            onClick={() => tap('reaction')}
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
          <button
            type="button"
            className="home-star is-first home-secret-trigger"
            aria-label="별"
            onClick={() => tap('lights')}
          >
            <InterfaceIcon name="asterisk" />
          </button>
          <span className="home-star is-second" aria-hidden="true">
            <InterfaceIcon name="sparkle" />
          </span>
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
      {secret && <HomeSecrets secret={secret} onClose={close} />}
    </section>
  );
}
