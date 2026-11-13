import React, { lazy, Suspense, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  NavLink,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
const LoginPage = lazy(() => import('./auth/LoginPage'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const RouteReplayPage = lazy(() => import('./pages/RouteReplayPage.jsx'));
const RepsPage = lazy(() => import('./pages/RepsPage.jsx'));
const OutletsPage = lazy(() => import('./pages/OutletsPage.jsx'));
const ReconciliationPage = lazy(() => import('./pages/ReconciliationPage.jsx'));
const ProductsPage = lazy(() => import('./pages/ProductsPage.jsx'));
const AuditLogPage = lazy(() => import('./pages/AuditLogPage.jsx'));
const TerritoriesPage = lazy(() => import('./pages/TerritoriesPage.jsx'));
const LeadsPage = lazy(() => import('./pages/LeadsPage.jsx'));
const ActivationsPage = lazy(() => import('./pages/ActivationsPage.jsx'));
const MerchandisingPage = lazy(() => import('./pages/MerchandisingPage.jsx'));
const TeamsPage = lazy(() => import('./pages/TeamsPage.jsx'));
const RegionsPage = lazy(() => import('./pages/RegionsPage.jsx'));
const CampaignsPage = lazy(() => import('./pages/CampaignsPage.jsx'));
const CompanyReportPage = lazy(() => import('./pages/CompanyReportPage.jsx'));
const BroadcastsPage = lazy(() => import('./pages/BroadcastsPage.jsx'));
const FieldRequestsPage = lazy(() => import('./pages/FieldRequestsPage.jsx'));
import PasswordChangeDialog from './components/PasswordChangeDialog.jsx';
import ConnectionBanner from './components/ConnectionBanner.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import { FeedbackProvider } from './components/Feedback.jsx';
import useTheme from './theme/useTheme';
import ErrorBoundary from './components/ErrorBoundary.jsx';
const ReferralRegistrationsPage = lazy(() => import('./pages/ReferralRegistrationsPage.jsx'));
const RecruitersPage = lazy(() => import('./pages/RecruitersPage.jsx'));
const PublicApplicationPage = lazy(() => import('./pages/PublicApplicationPage.jsx'));
const RecruiterPortal = lazy(() => import('./pages/RecruiterPortal.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));

function RequireAuth({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return user.role === 'manager' ? children : <Navigate to="/recruiter" replace />;
}

function RequireManager({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return user.role === 'manager' ? children : <Navigate to="/recruiter" replace />;
}

function RequireRecruiter({ children }) {
  const { user } = useAuth();
  if (!user || user.role !== 'recruiter')
    return <Navigate to="/login?role=recruiter&returnTo=%2Frecruiter-portal" replace />;
  return user.role === 'recruiter' ? children : <Navigate to="/" replace />;
}

function Shell({ children }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [changingPassword, setChangingPassword] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [mobileQuery, setMobileQuery] = useState('');
  const { theme, toggle: toggleTheme } = useTheme();
  const closeMenu = () => setMenuOpen(false);
  const navGroups = [
    [
      'Overview',
      [
        ['/', 'Overview'],
        ['/company-report', 'Company report'],
      ],
    ],
    [
      'Field',
      [
        ['/routes', 'Routes'],
        ['/outlets', 'Outlets'],
        ['/territories', 'Territories'],
        ['/merchandising', 'Merchandising'],
        ['/activations', 'Activations'],
      ],
    ],
    [
      'People',
      [
        ['/reps', 'Representatives'],
        ['/teams', 'Teams'],
        ['/regions', 'Regions'],
      ],
    ],
    [
      'Sales',
      [
        ['/leads', 'Leads'],
        ['/reconciliation', 'Reconciliation'],
        ['/products', 'Products'],
      ],
    ],
    [
      'Recruitment',
      [
        ['/campaigns', 'Campaigns'],
        ['/recruiters', 'Recruiter accounts'],
        ['/referrals', 'Applicant referrals'],
      ],
    ],
    [
      'Communication',
      [
        ['/broadcasts', 'Broadcasts'],
        ['/field-requests', 'Field requests'],
      ],
    ],
    [
      'Admin',
      [
        ['/audit-log', 'Audit log'],
        ['/settings', 'Settings'],
      ],
    ],
  ];
  const navItems = navGroups.flatMap(([, links]) => links);
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === 'Escape') setCommandOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const activeGroup =
    navGroups.find(([, links]) => links.some(([to]) => to === location.pathname))?.[0] ||
    'Overview';
  const [expandedGroup, setExpandedGroup] = useState(activeGroup);
  useEffect(() => setExpandedGroup(activeGroup), [activeGroup]);
  const navigation = navGroups.map(([group, links]) => (
    <details
      className="nav-group"
      key={group}
      open={expandedGroup === group}
      onToggle={(event) => {
        if (event.currentTarget.open && expandedGroup !== group) setExpandedGroup(group);
      }}
    >
      <summary>
        {group}
        <span aria-hidden="true">⌄</span>
      </summary>
      <div className="nav-group-links">
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'} onClick={closeMenu}>
            {label}
          </NavLink>
        ))}
      </div>
    </details>
  ));
  const [currentGroup, currentPage] = (() => {
    for (const [group, links] of navGroups) {
      const match = links.find(([to]) => to === location.pathname);
      if (match) return [group, match[1]];
    }
    return [null, null];
  })();
  const mobileItems = navItems.filter(([, label]) =>
    label.toLowerCase().includes(mobileQuery.toLowerCase()),
  );
  const commands = navItems.filter(([, label]) =>
    label.toLowerCase().includes(commandQuery.toLowerCase()),
  );
  const runCommand = (to) => {
    navigate(to);
    setCommandOpen(false);
    setCommandQuery('');
    closeMenu();
  };
  return (
    <div className="app-shell modern-shell">
      <aside className="sidebar">
        <NavLink className="brand" to="/" aria-label="Brandsphere home">
          <img
            className="brand-logo"
            src="/brandsphere-wordmark.png"
            alt="Brandsphere Marketing Agency"
          />
        </NavLink>
        <span className="sidebar-label">WORKSPACE</span>
        <nav className="sidebar-nav" aria-label="Dashboard">
          {navigation}
        </nav>
        <div className="sidebar-footer">
          <div className="user-card">
            <span className="user-avatar">{(user?.name || 'M').slice(0, 1).toUpperCase()}</span>
            <span>
              <strong>{user?.name || 'Manager'}</strong>
              <small>Manager account</small>
            </span>
          </div>
          <button className="sidebar-action" onClick={() => setChangingPassword(true)}>
            Account security
          </button>
          <button
            className="sidebar-action"
            onClick={() => {
              signOut();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <header className="mobile-header">
        <NavLink className="brand" to="/" aria-label="Brandsphere home" onClick={closeMenu}>
          <img
            className="brand-logo"
            src="/brandsphere-wordmark.png"
            alt="Brandsphere Marketing Agency"
          />
        </NavLink>
        <button
          className="nav-toggle"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="dashboard-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">☰</span>
          <span>{menuOpen ? 'Close' : 'Menu'}</span>
        </button>
      </header>
      <nav
        id="dashboard-navigation"
        className={`mobile-nav ${menuOpen ? 'is-open' : ''}`}
        aria-label="Dashboard"
      >
        <input
          className="mobile-nav-search"
          aria-label="Filter pages"
          value={mobileQuery}
          onChange={(event) => setMobileQuery(event.target.value)}
          placeholder="Find a page…"
        />
        {mobileItems.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/'} onClick={closeMenu}>
            {label}
          </NavLink>
        ))}
      </nav>
      <main className="workspace">
        <div className="workspace-top">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            {currentGroup && currentGroup !== currentPage ? (
              <>
                <span>{currentGroup}</span>
                <span aria-hidden="true">›</span>
              </>
            ) : null}
            <strong aria-current="page">{currentPage || 'Workspace'}</strong>
          </nav>
          <div className="workspace-actions">
            <button className="command-trigger" onClick={() => setCommandOpen(true)}>
              Search pages <kbd>⌘ K</kbd>
            </button>
            <NotificationBell />
            <button
              type="button"
              className="theme-toggle"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            >
              <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
            </button>
            <button className="workspace-account" onClick={() => setChangingPassword(true)}>
              Account
            </button>
          </div>
        </div>
        <ConnectionBanner />
        <div className="shell-content">
          <Suspense
            fallback={
              <div className="page-loading" role="status">
                Loading page…
              </div>
            }
          >
            {children}
          </Suspense>
        </div>
      </main>
      {commandOpen && (
        <div className="command-backdrop" onMouseDown={() => setCommandOpen(false)}>
          <section
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Quick switch"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="command-search">
              <span aria-hidden="true">⌕</span>
              <input
                autoFocus
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                placeholder="Jump to a workspace…"
              />
            </div>
            <div className="command-results">
              {commands.length ? (
                commands.map(([to, label]) => (
                  <button key={to} onClick={() => runCommand(to)}>
                    <span>{label}</span>
                    <small>{to === '/' ? 'Overview' : `Go to ${label}`}</small>
                  </button>
                ))
              ) : (
                <p>No matching workspace.</p>
              )}
            </div>
            <small className="command-hint">Press Esc to close</small>
          </section>
        </div>
      )}
      {changingPassword && <PasswordChangeDialog onClose={() => setChangingPassword(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <FeedbackProvider>
      <BrowserRouter>
        <ErrorBoundary>
          <Suspense
            fallback={
              <div className="page-loading" role="status">
                Loading workspace…
              </div>
            }
          >
            <Routes>
              <Route path="/apply" element={<PublicApplicationPage />} />
              <Route path="/engagement" element={<PublicApplicationPage variant="engagement" />} />
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/"
                element={
                  <RequireManager>
                    <Shell>
                      <Dashboard />
                    </Shell>
                  </RequireManager>
                }
              />
              <Route
                path="/recruiter-portal"
                element={
                  <RequireRecruiter>
                    <RecruiterPortal />
                  </RequireRecruiter>
                }
              />
              <Route path="/recruiter" element={<Navigate to="/recruiter-portal" replace />} />
              <Route
                path="/routes"
                element={
                  <RequireAuth>
                    <Shell>
                      <RouteReplayPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/reps"
                element={
                  <RequireAuth>
                    <Shell>
                      <RepsPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/products"
                element={
                  <RequireAuth>
                    <Shell>
                      <ProductsPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/outlets"
                element={
                  <RequireAuth>
                    <Shell>
                      <OutletsPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/territories"
                element={
                  <RequireAuth>
                    <Shell>
                      <TerritoriesPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/leads"
                element={
                  <RequireAuth>
                    <Shell>
                      <LeadsPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/activations"
                element={
                  <RequireAuth>
                    <Shell>
                      <ActivationsPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/merchandising"
                element={
                  <RequireAuth>
                    <Shell>
                      <MerchandisingPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/teams"
                element={
                  <RequireAuth>
                    <Shell>
                      <TeamsPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/regions"
                element={
                  <RequireAuth>
                    <Shell>
                      <RegionsPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/campaigns"
                element={
                  <RequireAuth>
                    <Shell>
                      <CampaignsPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/referrals"
                element={
                  <RequireAuth>
                    <Shell>
                      <ReferralRegistrationsPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/recruiters"
                element={
                  <RequireAuth>
                    <Shell>
                      <RecruitersPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/company-report"
                element={
                  <RequireAuth>
                    <Shell>
                      <CompanyReportPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/broadcasts"
                element={
                  <RequireAuth>
                    <Shell>
                      <BroadcastsPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/field-requests"
                element={
                  <RequireAuth>
                    <Shell>
                      <FieldRequestsPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/reconciliation"
                element={
                  <RequireAuth>
                    <Shell>
                      <ReconciliationPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route
                path="/audit-log"
                element={
                  <RequireAuth>
                    <Shell>
                      <AuditLogPage />
                    </Shell>
                  </RequireAuth>
                }
              />
<Route
                path="/settings"
                element={
                  <RequireAuth>
                    <Shell>
                      <SettingsPage />
                    </Shell>
                  </RequireAuth>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </BrowserRouter>
      </FeedbackProvider>
    </AuthProvider>
  );
}
