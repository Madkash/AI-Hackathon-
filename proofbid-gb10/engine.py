"""Conservative, deterministic prototype. No model inference or runtime attestation."""
import re

STATUSES = ['VERIFIED', 'DOCUMENT SUPPORTED', 'PARTIAL', 'CONFLICT', 'MISSING']

def extract_requirements(text):
    lines = [re.sub(r'^\s*(?:[-*•]|\d+[.)])\s*', '', x).strip() for x in text.splitlines()]
    # Keep source lines intact: combining, splitting, and interpreting arbitrary prose needs human review.
    markers = r'\b(must|shall|required|specify|describe|provide|should|support|retained|requirement)\b|\?'
    result = [x for x in lines if x and re.search(markers, x, re.I)]
    if len(result) > 200:
        raise ValueError('More than 200 candidate requirements. Split the RFP; none were silently discarded.')
    return result

def supported_requirement(text, category):
    """Only a small, explicit grammar can produce automatic satisfaction."""
    text = text.strip().rstrip('.').lower()
    prefix = r'(?:(?:the )?solution |(?:the )?platform |vendor |system )?(?:must|shall|should) '
    db = r'(?:postgres(?:ql)?|mysql|oracle)(?: \d+)?(?: or later| or greater|\+)?'
    patterns = {
        'database': prefix + r'support ' + db + r'(?: database)?(?: (?:and|or) ' + db + r'(?: database)?)*',
        'tls': prefix + r'enforce tls \d+\.\d+(?: or greater| or later|\+)',
        'logging': r'(?:audit )?logs (?:must|shall|should) be retained for \d+ days',
        'mfa': r'(?:administrators|admins) (?:must|shall|should) use mfa',
        'rbac': prefix + r'support rbac',
        'specs': r'(?:specify|describe) minimum ram requirements',
    }
    return bool(re.fullmatch(patterns.get(category, r'(?!)'), text))

def classify(text):
    patterns = {
        'database': r'postgres|mysql|oracle|database',
        'logging': r'\blogs?\b|logging|retention',
        'tls': r'\btls\b',
        'mfa': r'\bmfa\b|multi.factor',
        'rbac': r'\brbac\b|role.based',
        'compliance': r'soc\s*2|iso\s*27001|wcag|penetration',
        'specs': r'\bram\b',
    }
    found = [k for k, v in patterns.items() if re.search(v, text, re.I)]
    return found[0] if len(found) == 1 else 'manual'

def get_path(obj, path):
    for key in path.split('.'):
        if not isinstance(obj, dict) or key not in obj:
            return None
        obj = obj[key]
    return obj

def analyze(text, product, documents, product_source='product.json', rfp_source='RFP text', requirements=None):
    rows = []
    candidates = extract_requirements(text) if requirements is None else requirements
    for index, requirement in enumerate(candidates, 1):
        category = classify(requirement)
        evidence = []
        status = 'MISSING'
        finding = 'No supported deterministic check or matching evidence. Requires human input.'
        actual = None
        target = None

        def config(path):
            value = get_path(product, path)
            if value is not None:
                evidence.append({'kind': 'Configuration', 'source': product_source, 'location': path, 'excerpt': str(value), 'scope': 'Static configuration only; runtime behavior has not been tested.'})
            return value

        doc_patterns = {
            'logging': r'\blogs?\b|logging|retention', 'tls': r'\btls\b',
            'mfa': r'\bmfa\b|multi.factor', 'rbac': r'\brbac\b|role.based',
            'database': r'postgres|mysql|oracle', 'specs': r'\bram\b',
            'compliance': r'soc\s*2|iso\s*27001|wcag|penetration',
        }
        pattern = doc_patterns.get(category)
        if category == 'compliance':
            pattern = next((p for p in [r'soc\s*2', r'iso\s*27001', r'wcag', r'penetration'] if re.search(p, requirement, re.I)), None)
        for document in documents:
            for line_number, line in enumerate(document['text'].splitlines(), 1):
                if pattern and re.search(pattern, line, re.I):
                    evidence.append({'kind': 'Document', 'source': document['name'], 'location': f'Extracted line {line_number}', 'excerpt': line[:1200], 'scope': 'Supplier statement; authenticity, applicability, and validity require review.'})
        doc_evidence = list(evidence)
        # Negative or unusually complex requirements must not inherit a positive keyword match.
        ambiguous = bool(re.search(r'\b(not|never|except|unless|without|no)\b', requirement, re.I))
        if category == 'tls':
            actual = config('security.minimum_tls')
            match = re.search(r'tls\s*(\d+\.\d+)', requirement, re.I)
            target = match.group(1) if match else None
            if actual is not None and target:
                try:
                    version = lambda x: tuple(int(v) for v in str(x).split('.'))
                    status = 'VERIFIED' if version(actual) >= version(target) else 'PARTIAL'
                    finding = f'Configuration specifies TLS {actual}; buyer requests TLS {target} or later.'
                except ValueError:
                    finding = 'TLS version is not a supported numeric version. Review the configuration.'
        elif category == 'logging':
            actual = config('logging.retention_days')
            enabled = config('logging.enabled')
            match = re.search(r'(\d+)\s*(?:[- ]day|days)', requirement, re.I)
            target = int(match.group(1)) if match else None
            if isinstance(actual, (int, float)) and not isinstance(actual, bool) and target is not None and enabled is True:
                status = 'VERIFIED' if actual >= target else 'PARTIAL'
                finding = f'Configured retention is {actual} days; buyer requests {target} days.'
                claims = [int(m.group(1)) for e in doc_evidence for m in re.finditer(r'(\d+)\s*(?:[- ]day|days)', e['excerpt'], re.I)]
                if any(v != actual for v in claims):
                    status = 'CONFLICT'
                    finding = f'Documents state {", ".join(map(str, sorted(set(claims))))} days; configuration specifies {actual} days. Reconcile before responding.'
        elif category in ('mfa', 'rbac'):
            actual = config('security.admin_mfa' if category == 'mfa' else 'security.rbac')
            if isinstance(actual, bool):
                status = 'VERIFIED' if actual else 'PARTIAL'
                finding = f'{"Administrator MFA" if category == "mfa" else "RBAC"} is {"enabled" if actual else "disabled"} in the supplied configuration.'
            if category == 'mfa' and not re.search(r'admin', requirement, re.I):
                status = 'PARTIAL' if actual is not None else 'MISSING'
                finding += ' This check covers administrators only; the requested user scope needs review.'
        elif category == 'database':
            names = [name for name, pat in [('postgresql', r'postgres(?:ql)?'), ('mysql', r'mysql'), ('oracle', r'oracle')] if re.search(pat, requirement, re.I)]
            supported = []
            descriptions = []
            for name in names:
                val = config('databases.' + name)
                match = re.search((r'postgres(?:ql)?' if name == 'postgresql' else name) + r'\s*(\d+)', requirement, re.I)
                minimum = int(match.group(1)) if match else None
                valid = isinstance(val, dict) and type(val.get('min_version')) is int and type(val.get('max_version')) is int and val['min_version'] <= val['max_version']
                supported.append(bool(valid and (minimum is None or val['min_version'] <= minimum <= val['max_version'])))
                descriptions.append(f'{name}: configured versions {val["min_version"]}–{val["max_version"]}' if valid else f'{name}: no usable configuration evidence')
            if names:
                satisfied = any(supported) if re.search(r'\bor\b', requirement, re.I) else all(supported)
                status = 'VERIFIED' if satisfied else 'PARTIAL' if any(supported) else 'MISSING'
                finding = '; '.join(descriptions) + '. Compatibility has not been exercised at runtime.'
        elif category == 'specs':
            actual = config('specs.minimum_ram_gb')
            if type(actual) in (int, float) and actual > 0:
                status = 'VERIFIED' if re.search(r'\b(specify|describe)\b', requirement, re.I) else 'PARTIAL'
                finding = f'Product specification lists minimum RAM of {actual} GB.'
                if status == 'PARTIAL':
                    finding += ' Compare this specification with the buyer’s deployment constraint manually.'
        elif category == 'compliance' and doc_evidence:
            status = 'DOCUMENT SUPPORTED'
            finding = 'Related document text was located. A reviewer must confirm the actual report, scope, dates, and applicability. This is not a compliance determination.'
            if any(re.search(r'placeholder|fictional|absent|expired|not certified|pending|no (?:report|certificate)', e['excerpt'], re.I) for e in doc_evidence):
                status = 'PARTIAL'
                finding = 'Only incomplete, fictional, expired, or negative compliance references were located. An authentic applicable report must be reviewed before responding.'
        if ambiguous:
            status = 'PARTIAL' if evidence else 'MISSING'
            finding = 'The requirement contains a qualifier or negation; automatic satisfaction is withheld. Review the complete requirement and evidence.'
        # Complex combinations outside the prototype's finite check vocabulary require review.
        if re.search(r'\b(and|also|including)\b', requirement, re.I) and category != 'database':
            status = 'PARTIAL' if evidence else 'MISSING'
            finding += ' Compound requirement: confirm every clause manually.'
        if status == 'VERIFIED' and (not supported_requirement(requirement, category) or
                (category == 'database' and re.search(r'\band\b', requirement, re.I) and re.search(r'\bor\b', re.sub(r'or later|or greater', '', requirement), re.I))):
            status = 'PARTIAL'
            finding += ' The full wording is outside the supported comparison grammar; automatic satisfaction is withheld.'
        response = ('Based on the supplied static configuration, ' + finding[0].lower() + finding[1:]) if status == 'VERIFIED' else 'REQUIRES HUMAN REVIEW — ' + finding
        rows.append({'id': f'REQ-{index:03}', 'requirement': requirement, 'category': category, 'mandatory': bool(re.search(r'\b(must|shall|required)\b', requirement, re.I)), 'status': status, 'finding': finding, 'draft': response, 'evidence': evidence, 'reviewed': False})
    counts = {s: sum(r['status'] == s for r in rows) for s in STATUSES}
    return {'title': rfp_source, 'requirements': rows, 'counts': counts, 'readiness': round(100 * counts['VERIFIED'] / len(rows)) if rows else 0, 'demo': bool(product.get('demo_fixture')), 'method': 'Deterministic static checks. Readiness = configuration-verified requirements / all extracted requirements. Document matches require human review. Extraction is line-based and may miss prose or table requirements.'}
