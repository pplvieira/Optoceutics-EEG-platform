# Documentation Index

Welcome to the EEG Platform documentation. This folder contains comprehensive documentation for the entire codebase.

## Documentation Files

### 📋 [CODEBASE_ANALYSIS.md](./CODEBASE_ANALYSIS.md)
**Comprehensive codebase analysis and review**

- Executive summary
- Architecture overview
- Component analysis
- Code quality assessment
- Security analysis
- Performance analysis
- Recommendations
- Conclusion

**Best for:** Understanding the overall codebase structure, strengths, weaknesses, and improvement opportunities.

---

### 🏗️ [ARCHITECTURE.md](./ARCHITECTURE.md)
**System architecture and design documentation**

- Architecture modes (Browser Python, Local Backend, SSVEP Tool)
- Component architecture
- Data flow diagrams
- State management
- Security architecture
- Performance considerations
- Deployment architecture
- Technology decisions

**Best for:** Understanding how the system is structured, how components interact, and deployment options.

---

### 🧩 [COMPONENTS.md](./COMPONENTS.md)
**Detailed component documentation**

- Core components (PyodideEDFProcessor, ComprehensiveEDFDashboard, SSVEPAnalysisTool, page.tsx)
- Supporting components
- Services (pdfExporter)
- Utilities (experimentDatabase)
- Type definitions
- Component relationships

**Best for:** Understanding individual components, their props, state, and usage.

---

### 🔌 [API_REFERENCE.md](./API_REFERENCE.md)
**FastAPI backend API documentation**

- All API endpoints
- Request/response formats
- Error handling
- CORS configuration
- Authentication
- Data formats

**Best for:** Integrating with the FastAPI backend, understanding API contracts.

---

### 🔬 [ALGORITHMS.md](./ALGORITHMS.md)
**Signal processing and analysis algorithms**

- SSVEP detection algorithms (frequency domain, time domain, coherence)
- Principal Component Analysis (PCA)
- Power Spectral Density (PSD)
- Signal-to-Noise Ratio (SNR)
- Frequency band analysis
- Theta-Beta ratio
- Time-frequency analysis
- Algorithm parameters
- Performance considerations

**Best for:** Understanding the scientific methods implemented, algorithm parameters, and computational complexity.

---

## Quick Navigation

### For New Developers
1. Start with [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the system
2. Read [COMPONENTS.md](./COMPONENTS.md) to learn about components
3. Review [CODEBASE_ANALYSIS.md](./CODEBASE_ANALYSIS.md) for overall assessment

### For API Integration
1. Read [API_REFERENCE.md](./API_REFERENCE.md) for endpoint documentation
2. Check [ARCHITECTURE.md](./ARCHITECTURE.md) for data flow

### For Algorithm Understanding
1. Read [ALGORITHMS.md](./ALGORITHMS.md) for detailed algorithm documentation
2. Check [COMPONENTS.md](./COMPONENTS.md) for implementation locations

### For Code Review
1. Start with [CODEBASE_ANALYSIS.md](./CODEBASE_ANALYSIS.md)
2. Review recommendations and improvement areas
3. Check [ARCHITECTURE.md](./ARCHITECTURE.md) for architectural decisions

---

## Documentation Standards

All documentation follows these standards:

- **Markdown format** for easy reading and version control
- **Code examples** included where relevant
- **Clear structure** with headings and sections
- **Cross-references** between related documents
- **Last updated** dates for version tracking

---

## Contributing to Documentation

When updating documentation:

1. **Update the "Last Updated" date** at the bottom of each file
2. **Maintain consistency** with existing documentation style
3. **Add code examples** where helpful
4. **Cross-reference** related documentation
5. **Keep it concise** but comprehensive

---

## Additional Resources

### Project README
See the main [README.md](../README.md) in the project root for:
- Quick start guide
- Installation instructions
- Usage examples
- Feature overview

### Code Comments
For inline documentation, see:
- TypeScript/React components: JSDoc comments (where available)
- Python backend: Docstrings (where available)
- Python scripts: Inline comments

---

**Documentation Version:** 1.0  
**Last Updated:** December 2024

