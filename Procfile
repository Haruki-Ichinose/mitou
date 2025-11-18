backend: wait-for-it db:5432 -- bash -c "python backend/manage.py migrate && python backend/manage.py runserver 0.0.0.0:8000"
frontend: bash -c "cd frontend && if [ ! -d node_modules ]; then npm install; fi; npm start"
jupyter: jupyter lab --ip=0.0.0.0 --allow-root --NotebookApp.token=''