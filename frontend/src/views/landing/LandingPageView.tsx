import React, { useEffect, useRef } from "react";
import { ArrowDown, ArrowRight, BookOpen, Layers3, Search, ShieldCheck } from "lucide-react";
import { navigate } from "../../models/navigation";
import { Button } from "../common/ui";
import heroImage from "../../assets/images/sinapse-team-collaboration.webp";
import workflowVideo from "../../assets/videos/sinapse-workflow.mp4";
import workflowPoster from "../../assets/images/sinapse-workflow-poster.webp";
import "../../assets/styles/landing.css";

const benefits = [
  { icon: Layers3, number: "01", title: "Requisitos com clareza.", description: "Do épico ao critério de aceitação, cada detalhe encontra seu lugar.", detail: "ESTRUTURE" },
  { icon: Search, number: "02", title: "Contexto ao seu alcance.", description: "Encontre documentos e decisões no acervo de cada projeto.", detail: "CONECTE" },
  { icon: ShieldCheck, number: "03", title: "Sua equipe no controle.", description: "A IA identifica lacunas e sugere caminhos. Você revisa e decide.", detail: "EVOLUA" },
];

export const LandingPageView: React.FC = () => {
  const pageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pageRef.current || !("IntersectionObserver" in window)) return;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionPreference.matches) return;

    // Content stays visible by default, even when the observer is unavailable.
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-entering");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    pageRef.current.querySelectorAll("[data-landing-reveal]").forEach((section) => observer.observe(section));
    const handlePreferenceChange = () => {
      if (motionPreference.matches) observer.disconnect();
    };
    motionPreference.addEventListener("change", handlePreferenceChange);
    return () => {
      observer.disconnect();
      motionPreference.removeEventListener("change", handlePreferenceChange);
    };
  }, []);

  return (
    <div className="sinapse-home" ref={pageRef}>
      <section className="sinapse-home__hero" aria-labelledby="sinapse-home-title">
        <div className="sinapse-home__hero-copy" data-landing-reveal>
          <span className="sinapse-home__eyebrow"><span aria-hidden="true" /> DESENVOLVIDO PARA A PRO4TECH</span>
          <h1 id="sinapse-home-title">Requisitos claros.<br /><span>Conhecimento que permanece.</span></h1>
          <p className="sinapse-home__lead">Dê contexto às próximas decisões. Organize requisitos e encontre o que sua equipe já construiu.</p>
          <div className="sinapse-home__actions">
            <Button className="sinapse-home__primary" onClick={() => navigate("/projects")}>Explorar projetos <ArrowRight size={18} aria-hidden="true" /></Button>
            <Button className="sinapse-home__secondary" variant="secondary" onClick={() => navigate("/knowledge")}><BookOpen size={17} aria-hidden="true" /> Consultar acervo</Button>
          </div>
          <p className="sinapse-home__assurance"><ShieldCheck size={15} aria-hidden="true" /> IA sugere. Sua equipe decide.</p>
        </div>
        <figure className="sinapse-home__visual" data-landing-reveal>
          <img className="sinapse-home__hero-image" src={heroImage} alt="Equipe colaborando diante de um computador em um escritório." width="1600" height="900" fetchPriority="high" decoding="async" />
          <figcaption className="sinapse-home__visual-caption">
            <span><strong>Conhecimento construído em equipe.</strong><span><a href="https://unsplash.com/photos/team-collaborating-around-a-computer-in-an-office-UikYLDQj9_I">Foto: Vitaly Gariev / Unsplash</a></span></span>
          </figcaption>
          <span className="sinapse-home__visual-label" aria-hidden="true">PESSOAS · TECNOLOGIA</span>
        </figure>
      </section>
      <div className="sinapse-home__section-divider" aria-hidden="true"><span>MENOS DISPERSÃO. MAIS CONTEXTO.</span><ArrowDown size={17} /></div>
      <section className="sinapse-home__benefits" aria-label="O que você pode fazer no Sinapse" data-landing-reveal>
        {benefits.map(({ icon: Icon, number, title, description, detail }) => (
          <article className="sinapse-home__benefit" key={number}>
            <div className="sinapse-home__benefit-top"><Icon size={25} strokeWidth={1.5} aria-hidden="true" /><span aria-hidden="true">{number}</span></div>
            <span className="sinapse-home__card-label">{detail}</span>
            <h2>{title}</h2><p>{description}</p>
          </article>
        ))}
      </section>
      <section className="sinapse-home__flow" aria-labelledby="sinapse-flow-title" data-landing-reveal>
        <div className="sinapse-home__flow-copy">
          <span className="sinapse-home__eyebrow">DO REQUISITO À MEMÓRIA</span>
          <h2 id="sinapse-flow-title">Cada entrega deixa <span>conhecimento.</span></h2>
          <p>Preserve o que foi definido, entenda o porquê e leve o aprendizado adiante.</p>
          <Button variant="ghost" className="sinapse-home__text-link" onClick={() => navigate("/knowledge")}>Encontrar no acervo <ArrowRight size={17} aria-hidden="true" /></Button>
        </div>
        <ol className="sinapse-home__steps">
          <li><span className="sinapse-home__step-number" aria-hidden="true">01</span><div><h3>Defina com contexto</h3><p>Organize requisitos e critérios de aceitação.</p></div></li>
          <li><span className="sinapse-home__step-number" aria-hidden="true">02</span><div><h3>Preserve as decisões</h3><p>Reúna documentos e conhecimento do projeto.</p></div></li>
          <li><span className="sinapse-home__step-number" aria-hidden="true">03</span><div><h3>Encontre para reutilizar</h3><p>Consulte o acervo antes de começar de novo.</p></div></li>
        </ol>
      </section>
      <section className="sinapse-home__demo" aria-labelledby="sinapse-demo-title" data-landing-reveal>
        <div className="sinapse-home__demo-copy">
          <span className="sinapse-home__eyebrow">CONHEÇA O SINAPSE</span>
          <h2 id="sinapse-demo-title">Conhecimento em <span>movimento.</span></h2>
          <p>Uma visão rápida da organização de projetos, requisitos e critérios de aceitação.</p>
          <p className="sinapse-home__demo-summary">O vídeo percorre os detalhes de um projeto, seu backlog hierárquico e a visualização de um PBI.</p>
        </div>
        <figure className="sinapse-home__demo-media">
          <video controls preload="none" playsInline poster={workflowPoster} aria-label="Demonstração do fluxo de projetos e requisitos no Sinapse">
            <source src={workflowVideo} type="video/mp4" />
            Seu navegador não oferece suporte à reprodução deste vídeo.
          </video>
          <figcaption>Demonstração silenciosa do produto · 4 segundos</figcaption>
        </figure>
      </section>
      <section className="sinapse-home__closing" aria-labelledby="sinapse-closing-title" data-landing-reveal>
        <div><span className="sinapse-home__eyebrow">CONECTE O QUE SUA EQUIPE SABE</span><h2 id="sinapse-closing-title">Seu próximo ponto de partida.</h2></div>
        <Button className="sinapse-home__primary" onClick={() => navigate("/projects")}>Abrir projetos <ArrowRight size={18} aria-hidden="true" /></Button>
      </section>
    </div>
  );
};
