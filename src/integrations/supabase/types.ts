export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      checklist_items: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          default_cost_item_id: string | null
          id: string
          label: string
          normalized_label: string
          sort_order: number
          template_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          default_cost_item_id?: string | null
          id?: string
          label: string
          normalized_label: string
          sort_order?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          default_cost_item_id?: string | null
          id?: string
          label?: string
          normalized_label?: string
          sort_order?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_default_cost_item_id_fkey"
            columns: ["default_cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      cost_items: {
        Row: {
          active: boolean
          created_at: string
          default_total_cost: number
          id: string
          name: string
          normalized_name: string | null
          piece_length_ft: number | null
          unit_type: Database["public"]["Enums"]["unit_type"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_total_cost?: number
          id?: string
          name: string
          normalized_name?: string | null
          piece_length_ft?: number | null
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_total_cost?: number
          id?: string
          name?: string
          normalized_name?: string | null
          piece_length_ft?: number | null
          unit_type?: Database["public"]["Enums"]["unit_type"]
          updated_at?: string
        }
        Relationships: []
      }
      field_captures: {
        Row: {
          ai_output: Json | null
          created_at: string
          created_by: string
          error: string | null
          id: string
          include_materials: boolean
          parse_status: string
          project_id: string
          raw_text: string
        }
        Insert: {
          ai_output?: Json | null
          created_at?: string
          created_by: string
          error?: string | null
          id?: string
          include_materials?: boolean
          parse_status?: string
          project_id: string
          raw_text: string
        }
        Update: {
          ai_output?: Json | null
          created_at?: string
          created_by?: string
          error?: string | null
          id?: string
          include_materials?: boolean
          parse_status?: string
          project_id?: string
          raw_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_captures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      material_inventory: {
        Row: {
          created_at: string
          id: string
          location_type: string
          name: string
          project_id: string | null
          qty: number
          sku: string | null
          status: string
          unit: string | null
          updated_at: string
          updated_by: string | null
          vendor_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          location_type: string
          name: string
          project_id?: string | null
          qty: number
          sku?: string | null
          status?: string
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          location_type?: string
          name?: string
          project_id?: string | null
          qty?: number
          sku?: string | null
          status?: string
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_inventory_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_inventory_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_aliases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          can_manage_projects: boolean
          created_at: string
          full_name: string | null
          id: string
          is_admin: boolean
        }
        Insert: {
          can_manage_projects?: boolean
          created_at?: string
          full_name?: string | null
          id: string
          is_admin?: boolean
        }
        Update: {
          can_manage_projects?: boolean
          created_at?: string
          full_name?: string | null
          id?: string
          is_admin?: boolean
        }
        Relationships: []
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: Database["public"]["Enums"]["project_member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["project_member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          created_at: string
          has_missing_estimates: boolean
          id: string
          name: string
          scope_id: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          has_missing_estimates?: boolean
          id?: string
          name: string
          scope_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          has_missing_estimates?: boolean
          id?: string
          name?: string
          scope_id?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id"]
          },
        ]
      }
      rehab_library: {
        Row: {
          active: boolean
          category: string | null
          created_at: string
          created_by: string
          id: string
          keywords: string[] | null
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          created_at?: string
          created_by: string
          id?: string
          keywords?: string[] | null
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          created_at?: string
          created_by?: string
          id?: string
          keywords?: string[] | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      rehab_library_items: {
        Row: {
          created_at: string
          default_status: string
          description: string
          id: string
          library_id: string
          recipe_hint_id: string | null
          sort_order: number
          trade: string | null
        }
        Insert: {
          created_at?: string
          default_status?: string
          description: string
          id?: string
          library_id: string
          recipe_hint_id?: string | null
          sort_order?: number
          trade?: string | null
        }
        Update: {
          created_at?: string
          default_status?: string
          description?: string
          id?: string
          library_id?: string
          recipe_hint_id?: string | null
          sort_order?: number
          trade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rehab_library_items_library_id_fkey"
            columns: ["library_id"]
            isOneToOne: false
            referencedRelation: "rehab_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rehab_library_items_recipe_hint_id_fkey"
            columns: ["recipe_hint_id"]
            isOneToOne: false
            referencedRelation: "task_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_checklist_reviews: {
        Row: {
          checklist_item_id: string
          id: string
          notes: string | null
          scope_id: string
          state: string
          updated_at: string
        }
        Insert: {
          checklist_item_id: string
          id?: string
          notes?: string | null
          scope_id: string
          state: string
          updated_at?: string
        }
        Update: {
          checklist_item_id?: string
          id?: string
          notes?: string | null
          scope_id?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_checklist_reviews_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_checklist_reviews_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_items: {
        Row: {
          added_after_conversion: boolean
          computed_total: number | null
          cost_item_id: string | null
          created_at: string
          description: string
          id: string
          notes: string | null
          phase_key: string | null
          pricing_status: Database["public"]["Enums"]["pricing_status"]
          qty: number | null
          recipe_hint_id: string | null
          scope_id: string
          status: string
          unit: string | null
          unit_cost_override: number | null
          updated_at: string
        }
        Insert: {
          added_after_conversion?: boolean
          computed_total?: number | null
          cost_item_id?: string | null
          created_at?: string
          description: string
          id?: string
          notes?: string | null
          phase_key?: string | null
          pricing_status?: Database["public"]["Enums"]["pricing_status"]
          qty?: number | null
          recipe_hint_id?: string | null
          scope_id: string
          status?: string
          unit?: string | null
          unit_cost_override?: number | null
          updated_at?: string
        }
        Update: {
          added_after_conversion?: boolean
          computed_total?: number | null
          cost_item_id?: string | null
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          phase_key?: string | null
          pricing_status?: Database["public"]["Enums"]["pricing_status"]
          qty?: number | null
          recipe_hint_id?: string | null
          scope_id?: string
          status?: string
          unit?: string | null
          unit_cost_override?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_items_cost_item_id_fkey"
            columns: ["cost_item_id"]
            isOneToOne: false
            referencedRelation: "cost_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_items_recipe_hint_id_fkey"
            columns: ["recipe_hint_id"]
            isOneToOne: false
            referencedRelation: "task_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_items_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id"]
          },
        ]
      }
      scope_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["scope_member_role"]
          scope_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["scope_member_role"]
          scope_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["scope_member_role"]
          scope_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scope_members_scope_id_fkey"
            columns: ["scope_id"]
            isOneToOne: false
            referencedRelation: "scopes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scope_members_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scopes: {
        Row: {
          address: string
          baseline_locked_at: string | null
          checklist_template_id: string | null
          converted_at: string | null
          converted_project_id: string | null
          created_at: string
          created_by: string
          estimated_total_snapshot: number | null
          id: string
          name: string | null
          status: Database["public"]["Enums"]["scope_status"]
          updated_at: string
        }
        Insert: {
          address: string
          baseline_locked_at?: string | null
          checklist_template_id?: string | null
          converted_at?: string | null
          converted_project_id?: string | null
          created_at?: string
          created_by: string
          estimated_total_snapshot?: number | null
          id?: string
          name?: string | null
          status?: Database["public"]["Enums"]["scope_status"]
          updated_at?: string
        }
        Update: {
          address?: string
          baseline_locked_at?: string | null
          checklist_template_id?: string | null
          converted_at?: string | null
          converted_project_id?: string | null
          created_at?: string
          created_by?: string
          estimated_total_snapshot?: number | null
          id?: string
          name?: string | null
          status?: Database["public"]["Enums"]["scope_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scopes_checklist_template_id_fkey"
            columns: ["checklist_template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scopes_converted_project_id_fkey"
            columns: ["converted_project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      store_sections: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      task_candidates: {
        Row: {
          task_id: string
          user_id: string
        }
        Insert: {
          task_id: string
          user_id: string
        }
        Update: {
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_candidates_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_material_bundle_items: {
        Row: {
          bundle_id: string
          created_at: string
          id: string
          material_name: string
          provided_by: string | null
          qty: number | null
          sku: string | null
          store_section: string | null
          unit: string | null
          vendor_url: string | null
        }
        Insert: {
          bundle_id: string
          created_at?: string
          id?: string
          material_name: string
          provided_by?: string | null
          qty?: number | null
          sku?: string | null
          store_section?: string | null
          unit?: string | null
          vendor_url?: string | null
        }
        Update: {
          bundle_id?: string
          created_at?: string
          id?: string
          material_name?: string
          provided_by?: string | null
          qty?: number | null
          sku?: string | null
          store_section?: string | null
          unit?: string | null
          vendor_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_material_bundle_items_bundle_id_fkey"
            columns: ["bundle_id"]
            isOneToOne: false
            referencedRelation: "task_material_bundles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_material_bundles: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          id: string
          keywords: string[] | null
          name: string
          priority: number
          recipe_id: string | null
          trade: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          id?: string
          keywords?: string[] | null
          name: string
          priority?: number
          recipe_id?: string | null
          trade?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          id?: string
          keywords?: string[] | null
          name?: string
          priority?: number
          recipe_id?: string | null
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_material_bundles_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "task_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      task_materials: {
        Row: {
          confirmed_on_site: boolean
          created_at: string
          delivered: boolean
          id: string
          is_active: boolean
          item_type: string
          name: string
          provided_by: string
          purchased: boolean
          quantity: number | null
          sku: string | null
          store_section: string | null
          store_section_manual: boolean
          task_id: string
          tool_type_id: string | null
          unit: string | null
          vendor_url: string | null
        }
        Insert: {
          confirmed_on_site?: boolean
          created_at?: string
          delivered?: boolean
          id?: string
          is_active?: boolean
          item_type?: string
          name: string
          provided_by?: string
          purchased?: boolean
          quantity?: number | null
          sku?: string | null
          store_section?: string | null
          store_section_manual?: boolean
          task_id: string
          tool_type_id?: string | null
          unit?: string | null
          vendor_url?: string | null
        }
        Update: {
          confirmed_on_site?: boolean
          created_at?: string
          delivered?: boolean
          id?: string
          is_active?: boolean
          item_type?: string
          name?: string
          provided_by?: string
          purchased?: boolean
          quantity?: number | null
          sku?: string | null
          store_section?: string | null
          store_section_manual?: boolean
          task_id?: string
          tool_type_id?: string | null
          unit?: string | null
          vendor_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_materials_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_materials_tool_type_id_fkey"
            columns: ["tool_type_id"]
            isOneToOne: false
            referencedRelation: "tool_types"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recipe_step_materials: {
        Row: {
          created_at: string
          id: string
          material_name: string
          notes: string | null
          provided_by: string | null
          qty: number | null
          qty_formula: string | null
          recipe_step_id: string
          sku: string | null
          store_section: string | null
          unit: string | null
          vendor_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          material_name: string
          notes?: string | null
          provided_by?: string | null
          qty?: number | null
          qty_formula?: string | null
          recipe_step_id: string
          sku?: string | null
          store_section?: string | null
          unit?: string | null
          vendor_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          material_name?: string
          notes?: string | null
          provided_by?: string | null
          qty?: number | null
          qty_formula?: string | null
          recipe_step_id?: string
          sku?: string | null
          store_section?: string | null
          unit?: string | null
          vendor_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_recipe_step_materials_recipe_step_id_fkey"
            columns: ["recipe_step_id"]
            isOneToOne: false
            referencedRelation: "task_recipe_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recipe_steps: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_optional: boolean
          notes: string | null
          recipe_id: string
          sort_order: number
          title: string
          trade: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_optional?: boolean
          notes?: string | null
          recipe_id: string
          sort_order: number
          title: string
          trade?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_optional?: boolean
          notes?: string | null
          recipe_id?: string
          sort_order?: number
          title?: string
          trade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_recipe_steps_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "task_recipes"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recipes: {
        Row: {
          active: boolean
          created_at: string
          created_by: string
          estimated_cost: number | null
          id: string
          is_repeatable: boolean
          keywords: string[] | null
          last_actual_avg: number | null
          last_actual_count: number
          name: string
          trade: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by: string
          estimated_cost?: number | null
          id?: string
          is_repeatable?: boolean
          keywords?: string[] | null
          last_actual_avg?: number | null
          last_actual_count?: number
          name: string
          trade?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string
          estimated_cost?: number | null
          id?: string
          is_repeatable?: boolean
          keywords?: string[] | null
          last_actual_avg?: number | null
          last_actual_count?: number
          name?: string
          trade?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      task_workers: {
        Row: {
          active: boolean
          joined_at: string
          left_at: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          active?: boolean
          joined_at?: string
          left_at?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          active?: boolean
          joined_at?: string
          left_at?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_workers_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          actual_total_cost: number | null
          assigned_to_user_id: string | null
          assignment_mode: string
          bundles_applied: boolean
          claimed_at: string | null
          claimed_by_user_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          due_date: string | null
          expanded_recipe_id: string | null
          field_capture_id: string | null
          id: string
          lead_user_id: string | null
          materials_on_site: Database["public"]["Enums"]["materials_status"]
          needs_manager_review: boolean
          notes: string | null
          parent_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string
          recipe_hint_id: string | null
          room_area: string | null
          sort_order: number | null
          source_recipe_id: string | null
          source_recipe_step_id: string | null
          source_scope_item_id: string | null
          stage: Database["public"]["Enums"]["task_stage"]
          started_at: string | null
          started_by_user_id: string | null
          task: string
          trade: string | null
          updated_at: string
        }
        Insert: {
          actual_total_cost?: number | null
          assigned_to_user_id?: string | null
          assignment_mode?: string
          bundles_applied?: boolean
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          expanded_recipe_id?: string | null
          field_capture_id?: string | null
          id?: string
          lead_user_id?: string | null
          materials_on_site?: Database["public"]["Enums"]["materials_status"]
          needs_manager_review?: boolean
          notes?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id: string
          recipe_hint_id?: string | null
          room_area?: string | null
          sort_order?: number | null
          source_recipe_id?: string | null
          source_recipe_step_id?: string | null
          source_scope_item_id?: string | null
          stage?: Database["public"]["Enums"]["task_stage"]
          started_at?: string | null
          started_by_user_id?: string | null
          task: string
          trade?: string | null
          updated_at?: string
        }
        Update: {
          actual_total_cost?: number | null
          assigned_to_user_id?: string | null
          assignment_mode?: string
          bundles_applied?: boolean
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          expanded_recipe_id?: string | null
          field_capture_id?: string | null
          id?: string
          lead_user_id?: string | null
          materials_on_site?: Database["public"]["Enums"]["materials_status"]
          needs_manager_review?: boolean
          notes?: string | null
          parent_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string
          recipe_hint_id?: string | null
          room_area?: string | null
          sort_order?: number | null
          source_recipe_id?: string | null
          source_recipe_step_id?: string | null
          source_scope_item_id?: string | null
          stage?: Database["public"]["Enums"]["task_stage"]
          started_at?: string | null
          started_by_user_id?: string | null
          task?: string
          trade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_claimed_by_user_id_fkey"
            columns: ["claimed_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_expanded_recipe_id_fkey"
            columns: ["expanded_recipe_id"]
            isOneToOne: false
            referencedRelation: "task_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_field_capture_id_fkey"
            columns: ["field_capture_id"]
            isOneToOne: false
            referencedRelation: "field_captures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_recipe_hint_id_fkey"
            columns: ["recipe_hint_id"]
            isOneToOne: false
            referencedRelation: "task_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_recipe_id_fkey"
            columns: ["source_recipe_id"]
            isOneToOne: false
            referencedRelation: "task_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_recipe_step_id_fkey"
            columns: ["source_recipe_step_id"]
            isOneToOne: false
            referencedRelation: "task_recipe_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_scope_item_id_fkey"
            columns: ["source_scope_item_id"]
            isOneToOne: false
            referencedRelation: "scope_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_started_by_user_id_fkey"
            columns: ["started_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_stock: {
        Row: {
          id: string
          location_type: string
          project_id: string | null
          qty: number
          tool_type_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          location_type: string
          project_id?: string | null
          qty?: number
          tool_type_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          location_type?: string
          project_id?: string | null
          qty?: number
          tool_type_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_stock_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_stock_tool_type_id_fkey"
            columns: ["tool_type_id"]
            isOneToOne: false
            referencedRelation: "tool_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_stock_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_types: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sku: string | null
          vendor_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sku?: string | null
          vendor_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sku?: string | null
          vendor_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_projects: { Args: { _user_id: string }; Returns: boolean }
      expand_recipe: {
        Args: {
          p_parent_task_id: string
          p_recipe_id: string
          p_user_id: string
        }
        Returns: number
      }
      get_project_role: {
        Args: { _project_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["project_member_role"]
      }
      get_scope_role: {
        Args: { _scope_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["scope_member_role"]
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_project_member: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      is_scope_member: {
        Args: { _scope_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      materials_status: "Yes" | "Partial" | "No"
      pricing_status: "Priced" | "Needs Pricing"
      project_member_role: "contractor" | "manager" | "read_only"
      project_status: "active" | "paused" | "complete"
      scope_member_role: "viewer" | "editor" | "manager"
      scope_status: "Draft" | "Converted" | "Archived"
      task_priority:
        | "1 – Now"
        | "2 – This Week"
        | "3 – Soon"
        | "4 – When Time"
        | "5 – Later"
      task_stage: "Ready" | "In Progress" | "Not Ready" | "Hold" | "Done"
      unit_type: "each" | "sqft" | "lf" | "piece"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      materials_status: ["Yes", "Partial", "No"],
      pricing_status: ["Priced", "Needs Pricing"],
      project_member_role: ["contractor", "manager", "read_only"],
      project_status: ["active", "paused", "complete"],
      scope_member_role: ["viewer", "editor", "manager"],
      scope_status: ["Draft", "Converted", "Archived"],
      task_priority: [
        "1 – Now",
        "2 – This Week",
        "3 – Soon",
        "4 – When Time",
        "5 – Later",
      ],
      task_stage: ["Ready", "In Progress", "Not Ready", "Hold", "Done"],
      unit_type: ["each", "sqft", "lf", "piece"],
    },
  },
} as const
