import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  fetchCatalogSongs,
  revalidateCatalogSong,
  updateCatalogAsset,
  updateCatalogDefaultAsset,
  updateCatalogSong,
  validateCatalogSong
} from "../api/client.js";
import type {
  AdminCatalogSong,
  CatalogAssetPatch,
  CatalogEvaluation,
  CatalogValidationResult,
  Language,
  SongMetadataPatch,
  SongStatus
} from "./types.js";

export const songStatusOptions: Array<SongStatus | ""> = ["", "ready", "review_required", "unavailable"];
export const languageOptions: Array<Language | ""> = ["", "mandarin", "cantonese", "other"];

interface UseSongCatalogRuntimeResult {
  status: SongStatus | "";
  setStatus(status: SongStatus | ""): void;
  language: Language | "";
  setLanguage(language: Language | ""): void;
  songs: AdminCatalogSong[];
  selectedSongId: string | null;
  setSelectedSongId(songId: string | null): void;
  selectedSong: AdminCatalogSong | null;
  evaluation: CatalogEvaluation | null;
  validation: CatalogValidationResult | null;
  saveMetadata(songId: string, input: SongMetadataPatch): Promise<void>;
  setDefaultAsset(songId: string, assetId: string): Promise<void>;
  updateAsset(assetId: string, patch: CatalogAssetPatch): Promise<void>;
  revalidateSong(songId: string): Promise<void>;
  validateSong(songId: string): Promise<void>;
  isBusy: boolean;
  queryIsLoading: boolean;
  queryIsError: boolean;
}

export function useSongCatalogRuntime(): UseSongCatalogRuntimeResult {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SongStatus | "">("");
  const [language, setLanguage] = useState<Language | "">("");
  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<CatalogEvaluation | null>(null);
  const [validation, setValidation] = useState<CatalogValidationResult | null>(null);

  const query = useQuery({
    queryKey: ["catalog-songs", status, language],
    queryFn: () =>
      fetchCatalogSongs({
        ...(status ? { status } : {}),
        ...(language ? { language } : {})
      }),
    retry: false
  });
  const songs = query.data ?? [];

  useEffect(() => {
    if (songs.length === 0) {
      setSelectedSongId(null);
      return;
    }
    if (!selectedSongId || !songs.some((song) => song.id === selectedSongId)) {
      setSelectedSongId(songs[0]?.id ?? null);
    }
  }, [selectedSongId, songs]);

  const selectedSong = useMemo(
    () => songs.find((song) => song.id === selectedSongId) ?? songs[0] ?? null,
    [selectedSongId, songs]
  );

  const saveMetadataMutation = useMutation({
    mutationFn: ({ songId, input }: { songId: string; input: SongMetadataPatch }) => updateCatalogSong(songId, input),
    onSuccess: (result) => cacheSong(queryClient, result.song)
  });
  const defaultAssetMutation = useMutation({
    mutationFn: ({ songId, assetId }: { songId: string; assetId: string }) => updateCatalogDefaultAsset(songId, assetId),
    onSuccess: (result) => {
      setEvaluation(result.evaluation ?? null);
      cacheSong(queryClient, result.song);
    }
  });
  const assetMutation = useMutation({
    mutationFn: ({ assetId, patch }: { assetId: string; patch: CatalogAssetPatch }) => updateCatalogAsset(assetId, patch),
    onSuccess: (result) => {
      setEvaluation(result.evaluation ?? null);
      cacheSong(queryClient, result.song);
    }
  });
  const revalidateMutation = useMutation({
    mutationFn: (songId: string) => revalidateCatalogSong(songId),
    onSuccess: (result) => {
      setEvaluation(result.evaluation);
      cacheSong(queryClient, result.song);
    }
  });
  const validateMutation = useMutation({
    mutationFn: (songId: string) => validateCatalogSong(songId),
    onSuccess: (result) => setValidation(result)
  });

  const isBusy =
    saveMetadataMutation.isPending ||
    defaultAssetMutation.isPending ||
    assetMutation.isPending ||
    revalidateMutation.isPending ||
    validateMutation.isPending;

  return {
    status,
    setStatus,
    language,
    setLanguage,
    songs,
    selectedSongId,
    setSelectedSongId,
    selectedSong,
    evaluation,
    validation,
    async saveMetadata(songId, input) {
      await saveMetadataMutation.mutateAsync({ songId, input });
    },
    async setDefaultAsset(songId, assetId) {
      await defaultAssetMutation.mutateAsync({ songId, assetId });
    },
    async updateAsset(assetId, patch) {
      await assetMutation.mutateAsync({ assetId, patch });
    },
    async revalidateSong(songId) {
      await revalidateMutation.mutateAsync(songId);
    },
    async validateSong(songId) {
      await validateMutation.mutateAsync(songId);
    },
    isBusy,
    queryIsLoading: query.isLoading,
    queryIsError: query.isError
  };
}

export function cacheSong(queryClient: QueryClient, song: AdminCatalogSong) {
  queryClient.setQueriesData<AdminCatalogSong[]>({ queryKey: ["catalog-songs"] }, (current) =>
    current?.map((item) => (item.id === song.id ? song : item))
  );
}
