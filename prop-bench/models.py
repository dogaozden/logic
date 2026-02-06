"""Pydantic models for Culture Wiki data structures."""

from __future__ import annotations

from typing import List, Optional, Union

try:
    from pydantic import BaseModel, ConfigDict, Field
    USING_PYDANTIC = True
except ImportError:  # Fallback when dependencies are unavailable locally
    USING_PYDANTIC = False
    from dataclasses import asdict, dataclass, field

    class BaseModel:
        """Minimal stand-in for pydantic.BaseModel when pydantic is unavailable."""

        def __init__(self, **kwargs):
            for key, value in kwargs.items():
                setattr(self, key, value)

        def model_dump(self):
            try:
                return asdict(self)  # type: ignore[arg-type]
            except TypeError:
                return dict(self.__dict__)

        def model_copy(self, update: dict | None = None):
            data = self.model_dump()
            if update:
                data.update(update)
            return self.__class__(**data)

    def Field(default=None, default_factory=None, **kwargs):
        if default_factory is not None:
            return field(default_factory=default_factory)
        return field(default=default)

    def ConfigDict(**kwargs):
        return {}

    def datamodel(cls):
        return dataclass(eq=False)(cls)
else:

    def datamodel(cls):
        return cls


@datamodel
class Chapter(BaseModel):
    """A processed chapter or chunk of text."""

    model_config = ConfigDict(extra="ignore")

    book_slug: str
    book_title: str
    index: int
    title: str
    text: str
    token_count: int
    source_file: str
    section_type: str = "narrative"
    is_split: bool = False
    split_part: Optional[int] = None

    @property
    def chunk_id(self) -> str:
        """Return unique chunk identifier including split part if applicable."""
        from pathlib import Path
        base = Path(self.source_file).stem
        if self.is_split and self.split_part is not None:
            return f"{base}_split_{self.split_part:03d}"
        return base


@datamodel
class ChunkManifest(BaseModel):
    """Metadata manifest for chunked chapters."""

    model_config = ConfigDict(extra="ignore")

    book_slug: str
    book_title: str
    total_chunks: int
    total_tokens: int
    generated_at: str
    chunk_files: List[str]


@datamodel
class EntityFact(BaseModel):
    """A single cited fact about an entity."""

    model_config = ConfigDict(extra="ignore")

    fact: str
    quote: str
    location: Optional[str] = None
    id: Optional[str] = None  # Fact ID: {chunk_id}#{seq} e.g. "excession_ch014#003"


@datamodel
class EntityRelationship(BaseModel):
    """A relationship between entities."""

    model_config = ConfigDict(extra="ignore")

    target: str
    type: str
    strength: Optional[int] = None  # 1-10 intensity score
    quote: Optional[str] = None


@datamodel
class Entity(BaseModel):
    """Entity with aliases and cited facts."""

    model_config = ConfigDict(extra="ignore")

    name: str
    aliases: List[str] = Field(default_factory=list)
    species: Optional[str] = None
    affiliation: Optional[str] = None
    prominence: Optional[str] = None  # "major", "supporting", "mentioned"
    prominence_score: Optional[int] = None  # 1-10 numeric score
    relationships: List[EntityRelationship] = Field(default_factory=list)
    information: List[EntityFact] = Field(default_factory=list)


@datamodel
class EntityExtraction(BaseModel):
    """Structured extraction for a chapter chunk."""

    model_config = ConfigDict(extra="ignore")

    chunk_id: str
    chapter_title: str
    entity_type: str
    entities: List[Entity] = Field(default_factory=list)


@datamodel
class MergedEntity(BaseModel):
    """Deduplicated entity across books and chunks."""

    model_config = ConfigDict(extra="ignore")

    canonical_name: str
    aliases: List[str] = Field(default_factory=list)
    appears_in: List[str] = Field(default_factory=list)
    extraction_refs: List[str] = Field(default_factory=list)


@datamodel
class Citation(BaseModel):
    """Citation metadata for rendered articles."""

    model_config = ConfigDict(extra="ignore")

    id: Union[str, int]  # Fact ID: e.g., "excession_ch014#003" (or legacy int)
    book: str
    quote: str
    chunk_id: str
    chapter: Optional[str] = None
    source_file: Optional[str] = None


@datamodel
class ArticleSection(BaseModel):
    """A section within a wiki article."""

    model_config = ConfigDict(extra="ignore")

    title: str
    content: str
    citations: List = Field(default_factory=list)  # Fact IDs (can be strings or ints from LLM)


@datamodel
class Article(BaseModel):
    """Final wiki article structure."""

    model_config = ConfigDict(extra="ignore")

    entity_name: str
    entity_type: str
    slug: str
    summary: str
    generated_at: str
    aliases: List[str] = Field(default_factory=list)
    appears_in: List[str] = Field(default_factory=list)
    sections: List[ArticleSection] = Field(default_factory=list)
    citations: List[Citation] = Field(default_factory=list)
    related_entities: List[str] = Field(default_factory=list)
    prominence_score: int = 0


# Structured output models for synthesis -------------------------------------


@datamodel
class SynthesisSection(BaseModel):
    title: str = Field(description="Section title")
    content: str = Field(description="Section content with inline [fact_id] citations")
    citations: List = Field(
        default_factory=list,
        description="Optional list of citation ids used in this section (can be strings or ints)",
    )


@datamodel
class SynthesisCitation(BaseModel):
    id: str = Field(description="Fact ID used in the article (format: chunk_id#seq, e.g., excession_ch001#003)")
    book: str = Field(description="Book title where the quote appears")
    quote: str = Field(description="Exact quote from the source text")
    chunk_id: str = Field(description="Chunk id containing the quote")
    chapter: Optional[str] = Field(
        default=None, description="Chapter title if available"
    )
    source_file: Optional[str] = Field(
        default=None, description="Original source filename if available"
    )


@datamodel
class SynthesisResponse(BaseModel):
    summary: str = Field(description="Short summary of the entity")
    sections: List[SynthesisSection] = Field(
        description="Article sections with inline citations"
    )
    citations: List[SynthesisCitation] = Field(
        default_factory=list,
        description="DEPRECATED: Citations are rebuilt by Python from extraction data. LLM should leave empty.",
    )
    related_entities: List[str] = Field(
        default_factory=list, description="Optional related entity names"
    )


# Extraction schema for structured output ------------------------------------


@datamodel
class FactInfo(BaseModel):
    fact: str = Field(description="One specific observation about this entity")
    quote: str = Field(
        description="EXACT verbatim text from the passage (20-100 words, complete sentences)"
    )
    location: str = Field(description="Brief context: 'dialogue', 'narration', etc.")


@datamodel
class ExtractedRelationship(BaseModel):
    target: str = Field(description="Name of the related entity")
    type: str = Field(description="Nature of relationship")
    strength: Optional[int] = Field(default=None, description="Intensity 1-10")
    quote: Optional[str] = Field(default=None, description="Supporting quote")


@datamodel
class ExtractedEntity(BaseModel):
    name: str = Field(description="Primary name used in this chapter")
    information: List[FactInfo] = Field(
        description="Array of facts with supporting quotes"
    )
    aliases: List[str] = Field(default_factory=list, description="Other names/titles used")
    species: Optional[str] = Field(default=None, description="Species if mentioned")
    affiliation: Optional[str] = Field(
        default=None, description="Faction/organization if mentioned"
    )
    prominence: Optional[str] = Field(
        default=None, description="How significant: major, supporting, mentioned"
    )
    prominence_score: Optional[int] = Field(
        default=None, description="Numeric score 1-10"
    )
    relationships: List[ExtractedRelationship] = Field(
        default_factory=list, description="Connections to other entities"
    )


@datamodel
class ExtractionResponse(BaseModel):
    entities: List[ExtractedEntity] = Field(
        description="All entities found in this chapter"
    )
