"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NAV_LINKS, SITE_CONFIG } from '@/constants';
import { EASE_CALM } from '@/lib/motion';
import { ELEVATION_FLOATING } from '@/lib/tokens';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled])';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);

  const closeMenu = (returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) toggleButtonRef.current?.focus();
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const navEl = navRef.current;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;

    const getFocusable = () =>
      navEl
        ? Array.from(navEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
            (el) => el.offsetParent !== null
          )
        : [];

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMenu(true);
        return;
      }

      if (e.key !== 'Tab') return;

      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollBarWidth}px`;

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => closeMenu(true)}
            className="md:hidden fixed inset-0 z-40 bg-consulting-navy/30 dark:bg-black/50"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>
      <nav
        ref={navRef}
        className={`fixed top-0 inset-x-0 z-50 px-4 sm:px-6 transition-[padding] duration-300 ease-calm ${
          scrolled ? 'pt-3' : 'pt-6'
        }`}
      >
        <div
          className={`mx-auto flex justify-between items-center transition-all duration-300 ease-calm ${
            scrolled
              ? `max-w-4xl rounded-full border border-slate-200/70 dark:border-white/10 bg-white/80 dark:bg-[#0B1120]/80 backdrop-blur-md px-6 py-3 ${ELEVATION_FLOATING}`
              : 'max-w-7xl px-2 py-2'
          }`}
        >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE_CALM }}
          className="flex items-center gap-2"
        >
          <Link href="/" className="text-xl font-bold tracking-tight text-consulting-navy dark:text-[#F9FAFB]">
            {SITE_CONFIG.name}
          </Link>
          <div className="h-4 w-px bg-slate-300 dark:bg-slate-600 mx-2 hidden sm:block" />
          <span className="hidden sm:block text-xs font-mono uppercase tracking-widest text-consulting-slate dark:text-[#CBD5E1]">
            Research & Intelligence
          </span>
        </motion.div>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-sm font-medium text-consulting-slate dark:text-[#CBD5E1] hover:text-consulting-royal dark:hover:text-consulting-royal transition-colors duration-200 ease-calm"
            >
              {link.name}
            </Link>
          ))}
          <ThemeToggle />
        </div>

        {/* Mobile Toggle */}
        <div className="flex md:hidden items-center gap-3">
          <ThemeToggle />
          <button
            ref={toggleButtonRef}
            onClick={() => setIsOpen((v) => !v)}
            className="p-2 text-consulting-navy dark:text-[#F9FAFB]"
            aria-label="Toggle Menu"
            aria-expanded={isOpen}
            aria-controls="mobile-menu"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="mobile-menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE_CALM }}
            className="md:hidden relative z-50 bg-white dark:bg-[#111827] border-b border-slate-200 dark:border-slate-700/50 overflow-hidden"
          >
            <div className="px-6 py-6 flex flex-col gap-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className="text-lg font-medium text-consulting-slate dark:text-[#CBD5E1] hover:text-consulting-royal dark:hover:text-consulting-royal transition-colors duration-200 ease-calm"
                >
                  {link.name}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
    </>
  );
};

export default Navbar;
