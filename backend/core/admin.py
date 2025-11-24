from django.contrib import admin
from .models import Profile, Task, Note, Contact, CalendarEvent

@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user","timezone","daily_start_hour","daily_end_hour")

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ("title","user","status","due_date","created_at")
    list_filter = ("status",)
    search_fields = ("title","description")

@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ("title","user","note_type","date","created_at")
    list_filter = ("note_type",)
    search_fields = ("title","content")

@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ("name","email","phone","organization","user")
    search_fields = ("name","email","organization")

@admin.register(CalendarEvent)
class CalendarEventAdmin(admin.ModelAdmin):
    list_display = ("title","user","start","end","location","source")
    list_filter = ("source",)
    search_fields = ("title","description","location")
