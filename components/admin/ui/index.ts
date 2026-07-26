/**
 * Admin CRM UI kit (Milestone 0 foundation).
 *
 * Dark-surface, enterprise components reused by every Phase 2 module. Import
 * from "@/components/admin/ui". The light marketing kit lives in
 * "@/components/ui" and is separate.
 */

// Primitives
export { Button, buttonClasses } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./Button";
export { Badge } from "./Badge";
export type { BadgeProps, BadgeVariant } from "./Badge";

// Page structure
export { PageHeader } from "./PageHeader";
export type { PageHeaderProps } from "./PageHeader";

// States
export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";
export { LoadingState, Skeleton } from "./LoadingState";
export type { LoadingStateProps, LoadingVariant } from "./LoadingState";
export { ErrorState } from "./ErrorState";
export type { ErrorStateProps } from "./ErrorState";

// Data
export { DataTable } from "./DataTable";
export type { DataTableProps, Column, SortDir } from "./DataTable";
export { Pagination } from "./Pagination";
export type { PaginationProps } from "./Pagination";

// Filtering & search
export { FilterBar } from "./FilterBar";
export type { FilterBarProps, FilterConfig } from "./FilterBar";
export { SearchInput } from "./SearchInput";
export type { SearchInputProps } from "./SearchInput";

// Forms
export { FormField } from "./FormField";
export type { FormFieldProps } from "./FormField";
export { TextInput, fieldClasses } from "./TextInput";
export type { TextInputProps } from "./TextInput";
export { Textarea } from "./Textarea";
export type { TextareaProps } from "./Textarea";
export { Select } from "./Select";
export type { SelectProps, SelectOption } from "./Select";
export { EntityPicker } from "./EntityPicker";
export type { EntityPickerProps, EntityOption } from "./EntityPicker";

// Overlays
export { Drawer } from "./Drawer";
export type { DrawerProps } from "./Drawer";
export { Dialog } from "./Dialog";
export type { DialogProps } from "./Dialog";
export { ConfirmDialog } from "./ConfirmDialog";
export type { ConfirmDialogProps } from "./ConfirmDialog";
export { ToastProvider, useToast } from "./Toast";
export type { ToastVariant } from "./Toast";

// Hooks
export { useUrlParams } from "./useUrlParams";
export { useMounted, useOverlay } from "./useOverlay";
