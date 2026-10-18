import InterfaceIcon from '@/components/common/InterfaceIcon';
import { Link } from 'react-router-dom';
import '@/pages/public/PublicExperience.css';
import './HomeHero.css';

export default function HomeHero() {
  return (
    <section className="home-launch" aria-labelledby="home-launch-title">
      <div className="home-launch-aurora" aria-hidden="true" />
      <div className="experience-container">
        <div className="home-launch-heading">
          <p>상상이 코드가 되고, 코드가 가능성이 되는 곳</p>
          <h1 id="home-launch-title">
            당신의 다음 정답은,
            <br />
            <span>여기서 시작됩니다.</span>
          </h1>
        </div>
        <div className="home-universe" aria-hidden="true">
          <div className="home-universe-halo" />
          <div className="home-orbit home-orbit-one">
            <i />
          </div>
          <div className="home-orbit home-orbit-two">
            <i />
          </div>
          <div className="home-monogram">
            Z<span>O</span>J<span className="home-monogram-dot">.</span>
          </div>
          <div className="home-satellite is-code">
            <span>
              <InterfaceIcon name="code" />
            </span>
            <div>
              <small>YOUR IDEA</small>
              <strong>Hello, possibility.</strong>
            </div>
          </div>
          <div className="home-satellite is-result">
            <span>
              <InterfaceIcon name="check" />
            </span>
            <div>
              <small>YOUR NEXT STEP</small>
              <strong>한 번 더, 한 걸음 더.</strong>
            </div>
          </div>
          <span className="home-star is-first">
            <InterfaceIcon name="asterisk" />
          </span>
          <span className="home-star is-second">
            <InterfaceIcon name="sparkle" />
          </span>
          <span className="home-universe-coordinate">
            FROM ZERO
            <br />
            TO YOUR NEXT CHALLENGE
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
